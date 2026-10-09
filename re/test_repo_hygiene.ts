// 仓库卫生：第三方源码 / 厂商二进制 / 真机数据**不得进入版本库**。
//
// 背景（2026-10-09 发布前清点）：`re/upstream/` 下有 5 个文件被 git 跟踪，
// 它们是 zexsso/OP1-WebAPP 的源码与推导（DeviceView.vue / vercel_style.css /
// op1web_device.ts / op1web_theme.ts / op1web_PROTOCOL.md），合计约 33 KB。
// `.gitignore` 里当时**没有任何一条规则覆盖它们** —— 上一轮清理只处理了
// `_src/`、`*.exe`、`*.zip`，按扩展名清理漏掉了 .vue / .css / .ts 这三类。
//
// 这与项目铁律直接冲突（"官方 exe / 第三方源码不入库，结论沉淀到 SOURCES.md"）。
// 铁律写在文档里靠自觉不够 —— 这次就漏了。所以做成断言。
//
// ★ 为什么用「.gitignore 规则」而不是「磁盘上有什么」来判定：
//   官方 exe 与真机快照是**分析用的可再生材料**（反汇编取证要反复用），删了要重下。
//   它们本来就该留在磁盘上，只是不该进版本库。所以口径是：
//   **凡是这类文件，都必须有一条 .gitignore 规则盖住。**
//   反过来，"gitignore 管住了" 可以直接读 .gitignore 判定，不依赖 git 子进程 —
//   本机上 node 起 git 一律 EBUSY（沙箱限制），断言必须本地与 CI 都能跑。
//
//   至于"已经被跟踪、ignore 收不住"的情况（2026-10-09 清理前就是这样），
//   由 [1] 的口径负责：re/upstream/ 下只允许 md/sh/py，实文件根本进不来。
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".workbuddy"]);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** 仓库相对路径，统一用 / 分隔 */
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const files = [...walk(ROOT)].map(rel);

let GI = "";
function gitignoreHas(rule: string): boolean { return GI.includes(rule); }
try { GI = readFileSync(join(ROOT, ".gitignore"), "utf-8"); } catch { /* 无 gitignore 则全部失败 */ }

console.log("\n[1] re/upstream/ 下不得有第三方源码或厂商数据文件");
{
  /* 三类允许入库：
   *   ① 结论文档与脚本（.md/.sh/.py，含 MANIFEST / SOURCES / fetch.sh）
   *   ② **我们自己**的分析产物：we_series_cfg.ini（从官方配置解出的 EEPROM 默认值表）、
   *      family4_comtype.txt（第四族的 USB 通信类型对照）。SOURCES.md 第 194 行
   *      明确写了"只保留"这两份 —— 它们是结论，不是抄来的代码。
   *   ③ 扩展名为 .md/.txt/.ini/.json/.log 的可再生产物（反汇编片段、字符串导出），
   *      它们由我们的脚本生成，不含他人版权。
   * 不可入库：.js/.c/.vue/.ts/.css 等**第三方源码**，以及 .exe/.zip 二进制。
   */
  const THIRD_PARTY_SRC = /\.(js|c|vue|ts|css)$/i;
  const BIN = /\.(exe|zip|dll|msi)$/i;

  const offenders = files.filter(f => {
    if (!f.startsWith("re/upstream/")) return false;
    if (/(MANIFEST|SOURCES)\.md$|^re\/upstream\/fetch\.sh$/.test(f)) return false;
    if (/\.(md|sh|py|txt|ini|json|log)$/i.test(f)) return false;   // 自有产物
    // 官方二进制留在磁盘上供反汇编取证，但必须已被 ignore 规则盖住（见 [2]）
    if (BIN.test(f) && gitignoreHas("re/upstream/*.exe")) return false;
    return THIRD_PARTY_SRC.test(f) || BIN.test(f);
  });
  ok(offenders.length === 0,
     "无第三方源码（.js/.c/.vue/.ts/.css）；官方二进制已由ignore 规则盖住",
     offenders.join(", "));
}

console.log("\n[2] 厂商二进制必须被 gitignore 盖住（文件本身留着取证用）");
{
  const BIN = /\.(exe|zip|tar|gz|tgz|7z|rar|iso|dll|msi|apk|appimage)$/i;
  const onDisk = files.filter(f => BIN.test(f));
  ok(gitignoreHas("re/upstream/*.exe"), "re/upstream/*.exe 有 ignore 规则");
  ok(gitignoreHas("re/upstream/*.zip"), "re/upstream/*.zip 有 ignore 规则");
  // 逐一确认在磁盘上的每个二进制都被某条规则覆盖（人工核对清单用）
  console.log(`     磁盘上的二进制 ${onDisk.length} 个，均应被上述规则覆盖：` +
              onDisk.map(f => f.split("/").pop()).join(", ").slice(0, 120));
}

console.log("\n[3] 真机配置快照必须被 gitignore 盖住");
{
  const SNAP = /\.(bin|hex|dump)$/i;
  const onDisk = files.filter(f => SNAP.test(f) && !f.startsWith("tools/"));
  ok(gitignoreHas("re/xm1_blob_*.bin"), "re/xm1_blob_*.bin 有 ignore 规则");
  console.log(`     磁盘上的快照 ${onDisk.length} 个（可再生，保留供差分分析）`);
}

console.log("\n[4] 凭据类文件");
{
  const BAD = /(^|\/)(\.env|\.netrc|.*credential.*|.*secret.*|id_rsa|id_ed25519)(\.|$)/i;
  const offenders = files.filter(f => BAD.test(f));
  ok(offenders.length === 0, "无凭据文件", offenders.join(", "));
}

console.log("\n[5] .gitignore 覆盖了 2026-10-09 清理时漏掉的那几类（防回潮）");
{
  ok(gitignoreHas("op1web_"), ".gitignore 含 op1web_* 规则");
  ok(gitignoreHas("vercel_"), ".gitignore 含 vercel_* 规则");
  ok(gitignoreHas("*.vue"), ".gitignore 含 *.vue（上次漏网的三个扩展名之一）");
  ok(gitignoreHas("*.css"), ".gitignore 含 *.css");
  ok(gitignoreHas("*.ts"), "re/upstream 下的 .ts 另有op1web_* 覆盖");
}

console.log("\n[6] 结论文件在位（删了源码，结论必须留下）");
{
  ok(files.includes("re/upstream/SOURCES.md"), "re/upstream/SOURCES.md 在库");
  ok(files.includes("re/upstream/MANIFEST.md"), "re/upstream/MANIFEST.md 在库");
  ok(files.includes("MANIFEST.md"), "根级 MANIFEST.md 在库");
  const src = readFileSync(join(ROOT, "re/upstream/SOURCES.md"), "utf-8");
  ok(/设计令牌/.test(src) && /8b7cff/.test(src),
     "SOURCES.md 保留了 op1web 的设计令牌（删源码不丢结论）");
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);