// 把 TS 测试编译成 Node 可执行文件后运行
// （protocol.ts 等为无 DOM 依赖模块；test_presence 自带 re/_domstub.ts 提供的 DOM 桩）
import { build } from "esbuild";

const ENTRIES = [
  ["re/tests/test_xm2we.ts", "re/tests/.test_xm2we.mjs"],
  ["re/tests/test_xm1_write.ts", "re/tests/.test_xm1_write.mjs"],
  ["re/tests/test_8k_write.ts", "re/tests/.test_8k_write.mjs"],
  ["re/tests/test_write_scope.ts", "re/tests/.test_write_scope.mjs"],
  ["re/tests/test_repo_hygiene.ts", "re/tests/.test_repo_hygiene.mjs"],
  // ⚠️ 必须排在 test_presence 之前：它末尾是 process.exit(0)
  ["re/tests/test_cpi_step.ts", "re/tests/.test_cpi_step.mjs"],
  ["re/tests/test_diag.ts", "re/tests/.test_diag.mjs"],
  ["re/tests/test_btns.ts", "re/tests/.test_btns.mjs"],
  ["re/tests/test_sensor_cols.ts", "re/tests/.test_sensor_cols.mjs"],
  ["re/tests/test_write_gates.ts", "re/tests/.test_write_gates.mjs"],
  ["re/tests/test_verify_perf.ts", "re/tests/.test_verify_perf.mjs"],
  ["re/tests/test_we_diagnostics.ts", "re/tests/.test_we_diagnostics.mjs"],
  ["re/tests/test_we_frame.ts", "re/tests/.test_we_frame.mjs"],
  ["re/tests/test_cmd_frame.ts", "re/tests/.test_cmd_frame.mjs"],
  ["re/tests/test_presence.ts", "re/tests/.test_presence.mjs"],
];

for (const [entry, out] of ENTRIES) {
  await build({
    entryPoints: [entry],
    bundle: true, format: "esm", platform: "node", target: "node20",
    outfile: out, logLevel: "warning",
  });
  await import("../" + out + "?" + Date.now());
}
