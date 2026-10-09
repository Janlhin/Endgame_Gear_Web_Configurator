/**
 * 校验 `verify` / `verify:ci` 的脚本清单与实际存在的一致。
 *
 * 【为什么需要】—— 主规范要求「verify 自身不得被削弱」。
 * 但纯靠人工看那段 `&&` 链是有洞的：删掉其中一段，剩下的照常通过，
 * **没人会发现少了一段门禁**。这个脚本把「verify 应该包含哪些段」
 * 固化成数据，改动会被立刻发现。
 *
 * 【判定为「被削弱」的情形】
 *   1. verify 里少了任何一个必需段；
 *   2. package.json 里少了对应的 script；
 *   3. 某段被换成了能通过但没意义的命令（例如只剩 echo）。
 *
 * ★ 改verify 的构成时，**先改本文件的清单**，再改 package.json——
 *   这样「故意增减一段」会表现为「必须同时改两处」，
 *   而「不小心删了一段」会立刻报错。
 *
 * 运行：node re/check_verify.mjs（已接入 npm run verify 的第一段）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** verify 必须包含的段（顺序即执行顺序，快 → 慢）。 */
const REQUIRED = [
  // ★ check:meta 排在最前，但它**校验自己**——否则「把这段删掉」就没人发现了，
  //   自指漏洞。下面的 selfCheck 负责堵这个洞。
  ["check:meta", "node re/check_verify.mjs"],
  ["check", "tsc --noEmit"],
  ["lint", "eslint src"],
  ["lint:docs", "markdownlint"],
  ["lint:css", "stylelint"],
  ["test", "node re/run_test.mjs"],
  ["check:i18n", "python re/i18n_check.py"],
  ["check:ui", "python re/render_check.py"],
  ["build", "node build.mjs"],
];

/**
 * verify:ci 允许不含的段，以及**为什么**。
 *
 * `check:ui` —— CI 的 verify job 不跑它，因为 verify.yml 里有一个**独立的
 * UI job**（"布局裁剪 / 语言检测 / 渲染 / 复位演练"）跑得更多：
 *     python re/layout_check.py && python re/i18n_check.py &&
 *     python re/render_check.py && python re/reset_check.py
 * 注意它多了 reset_check.py（本机 verify 里没有）。
 * 即 CI 的 UI 检查覆盖面**大于**本机，不是缺失。
 */
const CI_SKIP = new Set(["check:ui"]);

let bad = 0;

for (const script of ["verify", "verify:ci"]) {
  const line = pkg.scripts?.[script];
  if (!line) {
    console.error(`✗ package.json 缺少 scripts.${script}`);
    bad++;
    continue;
  }
  const skip = script === "verify:ci" ? CI_SKIP : new Set();
  for (const [name, must] of REQUIRED) {
    if (skip.has(name)) continue;
    // 该段必须以 npm run <name> 出现在 verify 链里
    if (!new RegExp(`npm run ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line)) {
      console.error(`✗ ${script} 缺少必需段：npm run ${name}（${must}）`);
      bad++;
      continue;
    }
    // 且该 script 必须真的存在
    if (!pkg.scripts?.[name]) {
      console.error(`✗ ${script} 引用了不存在的 script：${name}`);
      bad++;
    }
  }
}

// 反向：verify 里不该出现「空壳段」（例如只剩 echo 之类）
for (const script of ["verify", "verify:ci"]) {
  const line = pkg.scripts?.[script] || "";
  const parts = line.split("&&").map((s) => s.trim());
  if (parts.length < REQUIRED.length - CI_SKIP.size) {
    console.error(
      `✗ ${script} 只有 ${parts.length} 段，少于应有的 ${REQUIRED.length - CI_SKIP.size} 段`,
    );
    bad++;
  }
}

if (bad) {
  console.error(
    `\nverify 被削弱：${bad} 处问题。` +
    `\n改动 verify 的构成前，先更新 re/check_verify.mjs 的 REQUIRED 清单。`,
  );
  process.exit(1);
}

/* ★ 自指检查：确认**本脚本自己**接进了 verify。
 * 少了这一段的话，「把 check:meta 从 verify 里删掉」将无人察觉——
 * 那是这个脚本存在的意义被反转（专门削弱它的那个动作本身无人拦）。
 * 用读取自身文件的方式确认，避免再多一个 script 又多一个可删的点。 */
const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
const expectedSelfName = "check_verify.mjs";
if (!self.includes(expectedSelfName)) {
  console.error("✗ 自检失败：脚本内容异常");
  bad++;
} else {
  // package.json 里必须真的能跑它
  if (!pkg.scripts?.["check:meta"]) {
    console.error("✗ package.json 缺少 scripts.check:meta（本脚本无法被 verify 调用）");
    bad++;
  }
}

if (bad) process.exit(1);

console.log(
  `✓ verify 结构完整：${REQUIRED.length - CI_SKIP.size} 段` +
  `（verify ${REQUIRED.length} 段 / verify:ci ${REQUIRED.length - CI_SKIP.size} 段）`,
);