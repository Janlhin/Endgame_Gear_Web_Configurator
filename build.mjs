// 构建脚本：把 src/ 与 scss/ 打包成单文件 dist/index.html（保持零依赖分发特性）
//
// 流程：esbuild 打包 TS → sass 编译 SCSS → 两者注入模板 → 输出
//   index.template.html 里的占位符：
//     /*__BUNDLE__*/  ← 打包后的 JS
//     /*__STYLES__*/  ← 编译后的 CSS
//
// ⚠️ 样式一律在 scss/ 下用 SCSS 维护（项目强制约定），不要在模板里直接写 <style>。
import { build } from "esbuild";
import * as sass from "sass";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { mdToHtml } from "./tools/md2html.mjs";

mkdirSync("dist", { recursive: true });

// 产物是发给使用者的，不该携带开发注释（注释属于 src/ 和模板的开发者便笺）。
// esbuild 那条链路由 minifyWhitespace 保证；模板里的内联 <script> 不经 esbuild，
// 所以这里兜一道断言 —— 谁在模板里写了注释，构建就会失败。
// 判据必须是「行首的 /* 或 //」：只看 // + 中文会误报，文案里
// 「（须 https:// 或 file://），WebHID 被禁用」这种字符串就会中招。
// 产物里的字符串不会出现真实换行（换行在源码里是 \n 两个字符），所以行首判据是安全的。
function assertNoDevComments(out, label) {
  const m = out.match(/<!--/) || out.match(/(^|\n)[ \t]*(\/\*|\/\/)/);
  if (m) {
    const at = out.indexOf(m[0]);
    throw new Error(
      `${label} 里残留开发注释：\n    ${JSON.stringify(out.slice(at, at + 70))}\n` +
      `  注释请写在 src/ 下（会随 minifyWhitespace 被剥离）或模板之外 —— 模板内联脚本会原样进产物。`
    );
  }
}

const minify = process.argv.includes("--minify");

// ---------- 1. TS → JS ----------
// 产物是发给使用者的，不该承载开发注释 —— 注释留在 src/ 里。
// esbuild 只在压缩阶段移除注释，所以默认构建也开 minifyWhitespace：
// 它去掉注释和多余空白，但**不改标识符名**，产物仍可读（利于「开源可审计」这一卖点）。
// --minify 再额外开启语法压缩与标识符混淆。
const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: ["es2020", "chrome89"],
  write: false,
  minify,
  minifyWhitespace: true,
  // esbuild 默认 charset="ascii"，会把所有非 ASCII 转义成 \uXXXX（实测 18105 处、
  // 白占约 106 KB），中文文案在产物里变成 \u811A\u672C 一串码点 —— 既大又不可读。
  // 模板已声明 <meta charset="UTF-8">，这里保持 UTF-8 原样输出。
  charset: "utf8",
  // 本项目无第三方代码进入产物，故无法律注释需要保留；若将来引入，改成 "inline"。
  legalComments: "none",
});
const js = result.outputFiles[0].text;

// ---------- 2. SCSS → CSS ----------
const cssResult = sass.compile("scss/main.scss", {
  style: minify ? "compressed" : "expanded",
  loadPaths: ["scss"],
});
const css = cssResult.css.replace(/\/\*[\s\S]*?\*\//g, "").trim();

// ---------- 3. 注入模板 ----------
const template = readFileSync("index.template.html", "utf-8");
for (const marker of ["/*__BUNDLE__*/", "/*__STYLES__*/"]) {
  if (!template.includes(marker)) throw new Error(`模板缺少占位符 ${marker}`);
}
// 测试清单：docs/test-checklist.md 是唯一真相源，构建时渲染进页面。
// 志愿者拿到的是单文件工具（离线双击即用），仓库里保留 md 便于评审与 diff —— 不手抄两份。
// 双语：中文版 + 英文版（test-checklist.en.md）都渲染进去，运行时按 i18n 语言
// 切换显示（见 src/i18n.ts 的 applyI18n）——其余 6 种语言回退到英文版。
const checklistZh = mdToHtml(readFileSync("docs/test-checklist.md", "utf-8"));
const checklistEn = mdToHtml(readFileSync("docs/test-checklist.en.md", "utf-8"));
const checklistHtml =
  `<div id="mdChecklistZh" lang="zh-CN">\n${checklistZh}\n</div>\n` +
  `<div id="mdChecklistEn" lang="en" hidden>\n${checklistEn}\n</div>`;

const html = template
  .replace("/*__STYLES__*/", () => css)
  .replace("/*__CHECKLIST__*/", () => checklistHtml)
  .replace("/*__BUNDLE__*/", () => js);

assertNoDevComments(html, "index.html");

writeFileSync("dist/index.html", html);
// 同步写根目录 index.html：保持"双击即用 + GitHub Pages 指向仓库根"的工作流，
// 并避免根目录副本与 src/ 脱节（v1.2 曾因此丢过 0x71/0x72 功能）。
writeFileSync("index.html", html);

/* 体积按**真实字节数**（UTF-8）报，而不是字符串的 .length ——
   含中文的产物按 .length 算会少报约 20%（中文在 UTF-16 里算 1 个码元、
   在磁盘上占 3 字节），曾把 253 KB 报成 207 KB。 */
const kb = (s) => (Buffer.byteLength(s, "utf8") / 1024).toFixed(1);
const kbOf = (s) => Buffer.byteLength(s, "utf8") / 1024;

/* ★ 体积基线门禁（S-103）
 *
 * 基线取285.8 KB（2026-10-09，esbuild 0.28.2 + stylelint 接入后），
 * 上限定 **300 KB** —— 留约 5% 余量：
 *   · 余量太小 → 正常的文案微调就红，维护者会习惯性去改阈值，门禁失效；
 *   · 余量太大 → 混入一个 50KB 的依赖也照样绿，失去意义。
 * 300 KB 意味着「有人在没意识到的情况下塞进一个新库」会被立刻发现。
 *
 * ⚠️ 只想让体积变大时，先问「这个功能值不值这几十 KB」——
 * 本项目的硬约束是**零外部依赖单文件**（见 README）。
 * 确需上调时连同理由写进本注释，不要只改数字。
 *
 * 上调记录：
 *   2026-10-20  300 → 302：修复 "Failed to write the feature report."
 *   （判族收紧 isXm2weFamily + 键盘集合合并放行策略 + bKeyboardMerged
 *   八语言词条）。纯自有代码增量 ~0.6 KB，未引入任何外部依赖。
 *   2026-10-20  302 → 305：同日审计修复（回退过滤器厂商区间展开、
 *   写入互斥 bBusy×8、OP1we 有线判定、rawReceive 视图偏移）。
 *   当前产物 301.7 KB，余量 ~3 KB —— 仍足以在有人塞进任何库时立刻报红。
 *   2026-10-20  305 → 320：UI 视觉改版（双主题、玻璃卡片、背景光晕/网格/
 *   颗粒、入场与悬停动效）。CSS 6.7 → 18.9 KB，全部为自有 SCSS，
 *   无外部字体/图片/脚本；产物 314.2 KB，余量 ~6 KB。
 *   2026-10-20  320 → 325：设备仪表盘 hero（主视觉 + 电量环 + 三格指标）。
 *   增量 1.7 KB：hero 结构、仪表盘样式、电量环/指标的只读渲染逻辑。
 *   产物 321.7 KB，余量 ~3 KB —— 仍是紧约束，塞进任何库都会立刻报红。
 *   2026-10-20  325 → 330：改为双栏驾驶舱（左栏常驻 + 右侧单分区 + 分区导航）。
 *   增量 1.8 KB：cockpit.ts 导航逻辑、rail/stage 样式、family4Body 八语言词条。
 *   产物 326.8 KB，余量 ~3 KB。 */
const SIZE_BUDGET_KB = 330;
const actualKb = kbOf(html);
console.log(`dist/index.html + index.html written, ${kb(html)} KB  (js ${kb(js)} KB, css ${kb(css)} KB)`);
if (actualKb > SIZE_BUDGET_KB) {
  console.error(
    `\n✗ 体积超预算：${kb(html)} KB > ${SIZE_BUDGET_KB} KB` +
    `\n  新增 ${(actualKb - SIZE_BUDGET_KB).toFixed(1)} KB。` +
    `\n  本项目要求零外部依赖单文件——塞库之前先确认它值这个体积。` +
    `\n  确需上调预算，改build.mjs 的 SIZE_BUDGET_KB 并写明理由。`,
  );
  process.exitCode = 1;
}

// ---------- 4. 独立工具页：离线 blob 分析 / 对比 ----------
// 与主程序同源：共用 scss/ 令牌（因此深浅主题一致），产物同样是零依赖单文件，
// 可单独拷给别人用。逻辑是纯前端，不需要 esbuild，只做 SCSS 注入。
const studioCss = sass.compile("scss/studio.scss", {
  style: minify ? "compressed" : "expanded",
  loadPaths: ["scss"],
}).css.replace(/\/\*[\s\S]*?\*\//g, "").trim();

const studioTpl = readFileSync("tools/blob-studio.template.html", "utf-8");
if (!studioTpl.includes("/*__STYLES__*/")) throw new Error("studio 模板缺少 /*__STYLES__*/ 占位符");
const studioHtml = studioTpl.replace("/*__STYLES__*/", () => studioCss);

assertNoDevComments(studioHtml, "tools/blob-studio.html");
writeFileSync("tools/blob-studio.html", studioHtml);
console.log(`tools/blob-studio.html written, ${kb(studioHtml)} KB  (css ${kb(studioCss)} KB)`);
