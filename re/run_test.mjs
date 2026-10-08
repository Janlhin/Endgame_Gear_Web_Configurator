// 把 TS 测试编译成 Node 可执行文件后运行（xm2we.ts / protocol.ts 均为无 DOM 依赖模块）
import { build } from "esbuild";

const ENTRIES = [
  ["re/test_xm2we.ts", "re/.test_xm2we.mjs"],
  ["re/test_xm1_write.ts", "re/.test_xm1_write.mjs"],
  ["re/test_8k_write.ts", "re/.test_8k_write.mjs"],
];

for (const [entry, out] of ENTRIES) {
  await build({
    entryPoints: [entry],
    bundle: true, format: "esm", platform: "node", target: "node20",
    outfile: out, logLevel: "warning",
  });
  await import("../" + out + "?" + Date.now());
}
