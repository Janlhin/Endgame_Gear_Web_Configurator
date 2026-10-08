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

mkdirSync("dist", { recursive: true });

const minify = process.argv.includes("--minify");

// ---------- 1. TS → JS ----------
const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: ["es2020", "chrome89"],
  write: false,
  minify,
  legalComments: "inline",
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
const html = template
  .replace("/*__STYLES__*/", () => css)
  .replace("/*__BUNDLE__*/", () => js);

writeFileSync("dist/index.html", html);
// 同步写根目录 index.html：保持"双击即用 + GitHub Pages 指向仓库根"的工作流，
// 并避免根目录副本与 src/ 脱节（v1.2 曾因此丢过 0x71/0x72 功能）。
writeFileSync("index.html", html);

const kb = (n) => (n / 1024).toFixed(1);
console.log(`dist/index.html + index.html written, ${kb(html.length)} KB  (js ${kb(js.length)} KB, css ${kb(css.length)} KB)`);
