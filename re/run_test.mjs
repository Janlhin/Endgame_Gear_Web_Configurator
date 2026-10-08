// 把 TS 测试编译成 Node 可执行文件后运行（xm2we.ts 是浏览器模块，无 process 依赖问题）
import { build } from "esbuild";
import { writeFileSync } from "fs";
await build({
  entryPoints: ["re/test_xm2we.ts"],
  bundle: true, format: "esm", platform: "node", target: "node20",
  outfile: "re/.test_xm2we.mjs", logLevel: "warning",
});
const mod = await import("../re/.test_xm2we.mjs?" + Date.now());
