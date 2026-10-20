// 把 TS 测试编译成 Node 可执行文件后运行
// （protocol.ts 等为无 DOM 依赖模块；test_presence 自带 re/_domstub.ts 提供的 DOM 桩）
import { build } from "esbuild";

const ENTRIES = [
  ["re/test_xm2we.ts", "re/.test_xm2we.mjs"],
  ["re/test_xm1_write.ts", "re/.test_xm1_write.mjs"],
  ["re/test_8k_write.ts", "re/.test_8k_write.mjs"],
  ["re/test_write_scope.ts", "re/.test_write_scope.mjs"],
  ["re/test_repo_hygiene.ts", "re/.test_repo_hygiene.mjs"],
  // ⚠️ 必须排在 test_presence 之前：它末尾是 process.exit(0)
  ["re/test_cpi_step.ts", "re/.test_cpi_step.mjs"],
  ["re/test_diag.ts", "re/.test_diag.mjs"],
  ["re/test_btns.ts", "re/.test_btns.mjs"],
  ["re/test_sensor_cols.ts", "re/.test_sensor_cols.mjs"],
  ["re/test_write_gates.ts", "re/.test_write_gates.mjs"],
  ["re/test_presence.ts", "re/.test_presence.mjs"],
];

for (const [entry, out] of ENTRIES) {
  await build({
    entryPoints: [entry],
    bundle: true, format: "esm", platform: "node", target: "node20",
    outfile: out, logLevel: "warning",
  });
  await import("../" + out + "?" + Date.now());
}
