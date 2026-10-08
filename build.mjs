// 构建脚本：把 src/ 打包成单文件 dist/index.html（保持零依赖分发特性）
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: ["es2020", "chrome89"],
  write: false,
  minify: process.argv.includes("--minify"),
  legalComments: "inline",
});

const js = result.outputFiles[0].text;
const template = readFileSync("index.template.html", "utf-8");
const html = template.replace("/*__BUNDLE__*/", () => js);
writeFileSync("dist/index.html", html);
console.log("dist/index.html written,", (html.length / 1024).toFixed(1), "KB");
