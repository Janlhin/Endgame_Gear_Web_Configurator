// CPI 归一化必须与**官方配置工具**一致 —— 钉死 v1.3.0 之前的两个偏差。
//
// 背景（2026-10-09）：官方二进制反汇编（re/upstream/disasm.py）还原出六款官方工具的
// CPI 规则与我们此前的实现有两处不符：
//   ① v2 族官方是**全程对齐 10**（下限 10 / 上限 30000），
//      我们曾按第三方设备表做成「≤10000 走 10、>10000 走 50」——那个分段并不存在；
//   ② gen1 官方**上限是 26000**，我们写成 30000。
// 另外 Purple Frost（0x1976）的 gen 曾被填成 2，官方 PF 工具证明它是 gen1 规则。
//
// 这些断言不接硬件即可验证，且是"按官方设置来"这条底线的一部分。
import "./_domstub.js";
import { cpiClamp, cpiInputBounds } from "../src/blob.js";
import { MOUSE_PIDS } from "../src/protocol.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

console.log("[1] gen=2（0x1982 / 0x1984 / 0x1978 官方工具）= 10–30000，全程对齐 10");
{
  const c = (v: number) => cpiClamp(v, 2);
  ok(c(1010) === 1010, "1010 → 1010");
  ok(c(1234) === 1230, "1234 → 1230（对齐到 10）", String(c(1234)));
  ok(c(10120) === 10120, "10120 → 10120（>10000 也不切 50 —— 官方没有这个分段）", String(c(10120)));
  ok(c(10125) === 10130, "10125 → 10130（余数 ≥5 进位，与官方一致）", String(c(10125)));
  ok(c(5) === 10, "5 → 10（夹到下限）");
  ok(c(99999) === 30000, "99999 → 30000（夹到上限）");
  const b = cpiInputBounds(2);
  ok(b.min === 10 && b.step === 10 && b.max === 30000, "输入框边界 = 10 / 10 / 30000", JSON.stringify(b));
}

console.log("\n[2] gen=1 与 XM1（0x1968 / 0x1972 官方工具）= 50–26000，对齐 50");
{
  const c = (v: number) => cpiClamp(v, 1);
  ok(c(1150) === 1150, "1150 → 1150");
  ok(c(1234) === 1250, "1234 → 1250（余数 34 ≥25 进位，与官方一致）", String(c(1234)));
  ok(c(1230) === 1250, "1230 → 1250（同上：官方也是 1250）", String(c(1230)));
  ok(c(49) === 50, "49 → 50");
  ok(c(30000) === 26000, "30000 → 26000（官方上限，不是 30000）", String(c(30000)));
  ok(cpiClamp(1234, 0) === 1250, "XM1（gen=0）走同一规则");
  ok(cpiClamp(1234, null) === 1250, "gen 未知时保守走 gen1 规则");
  const b = cpiInputBounds(1);
  ok(b.min === 50 && b.step === 50 && b.max === 26000, "输入框边界 = 50 / 50 / 26000", JSON.stringify(b));
}

console.log("\n[3] 型号 → gen 映射（依据官方工具的 CPI 常量）");
{
  ok(MOUSE_PIDS[0x1976][1] === 1, "0x1976 Purple Frost = gen1（官方 PF 工具是 ÷50 规则）",
     JSON.stringify(MOUSE_PIDS[0x1976]));
  ok(MOUSE_PIDS[0x1982][1] === 2, "0x1982 XM2w 4k v2 = gen2");
  ok(MOUSE_PIDS[0x1984][1] === 2, "0x1984 OP1w 4k v2 = gen2");
  ok(MOUSE_PIDS[0x1968][1] === 1, "0x1968 XM2w 4k = gen1");
  ok(MOUSE_PIDS[0x1972][1] === 1, "0x1972 OP1w 4k = gen1");
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);