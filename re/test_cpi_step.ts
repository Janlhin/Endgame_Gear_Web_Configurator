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
import { cpiClamp, cpiInputBounds, buildPowerPayload } from "../src/blob.js";
import { MOUSE_PIDS } from "../src/protocol.js";
import { fwStr } from "../src/session.js";
import { S } from "../src/state.js";

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

console.log("\n[4] 固件版本号：major 在前、minor 在后，次版本号补零两位");
{
  /* 官方工具显示「鼠标固件 1.07 / 接收器固件 1.01」。
   * 此前实现把两个字节当小端 u16 拼起来再按高字节读 major，
   * 方向相反导致主次对调（1.07 → 7.1），且次版本号没补零（1.01 → 1.1）。 */
  ok(fwStr(1, 7) === "1.07", "鼠标固件 1.07", fwStr(1, 7));
  ok(fwStr(1, 1) === "1.01", "接收器固件 1.01", fwStr(1, 1));
  ok(fwStr(1, 10) === "1.10", "次版本号 10 补零", fwStr(1, 10));
  ok(fwStr(2, 0) === "2.00", "次版本号 0 补零", fwStr(2, 0));
  ok(fwStr(1, 5) === "1.05", "次版本号 5 补零", fwStr(1, 5));
}

console.log("\n[5] 点击过滤写入 0x15 帧 p[4..8]：取自 blob 真值 buttons[i].filter");
{
  /* 0x15 的 p[4..8] 就是前 5 个按键的 filter 槽
   * （官方 XM2w-4k 工具 0x15 builder @0x404B50 → blob[0x3D/0x44/0x4B/0x52/0x59]）。
   * 此前写入取的是 S.stage.filters[]，而那个数组**从不被赋值**、
   * 恒为默认 [8,8,8,8,8] —— 等于每次「应用性能/电源」都把设备真实的
   * GX Safe / GX Speed 静默覆盖成 8ms。 */
  const saved = S.stage;
  S.stage = { ...saved, buttons: [
    { type: 1, code: 1, key: 1, filter: 0xF1 },  // 左键 = GX Speed
    { type: 1, code: 2, key: 2, filter: 0xF0 },  // 右键 = GX Safe
    { type: 1, code: 3, key: 3, filter: 12 },
    { type: 1, code: 4, key: 4, filter: 8 },
    { type: 1, code: 5, key: 5, filter: 8 },
    { type: 1, code: 6, key: 6, filter: 8 },
  ] } as any;
  const p = buildPowerPayload();
  ok(p[4] === 0xF1, "p[4] = 左键 GX Speed（0xF1），不是默认的 8", String(p[4]));
  ok(p[5] === 0xF0, "p[5] = 右键 GX Safe（0xF0）", String(p[5]));
  ok(p[6] === 12, "p[6] = 第 3 键 12ms", String(p[6]));
  ok(p[7] === 8 && p[8] === 8, "p[7]/p[8] = 第 4/5 键 8ms");
  S.stage = saved;
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);