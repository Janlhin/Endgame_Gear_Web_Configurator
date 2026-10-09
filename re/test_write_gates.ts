// 发布前安全审计的回归测试：写入闸门的**默认状态**必须真的是"关"。
//
// 由来（2026-10-09）：准备对外发布前逐条查写入路径，发现三处"看起来安全、实际敞开"：
//   ① WE 族（XM2we / OP1we）代码从未接过真机，写入按钮却是完全可用的，且没有任何只读提示；
//   ② 8k 有线族的只读只靠 render() 把按钮置灰 —— guard4k() 对 8k 是放行的，
//      handler 一旦触发就会真的发 0x11 整块写；
//   ③ 导入配置只校验长度，不校验代际 —— 把 v2 的配置导入 v1 设备会按错位编码写入。
//
// 设计口径（本文件钉死的就是它）：
//   **默认只读**；点写入按钮会弹确认框，确认后**仅本次连接**放行，并强制先导出备份。
//   所以这里断言的是"没有确认 ⇒ 一定写不出去"，以及"许可不跨连接"。
import "./_domstub.js";
import { Xm2weSession, WE_WRITES_ENABLED, setWeWrites } from "../src/xm2we.js";
import { guard4k } from "../src/connect.js";
import { MOUSE_PIDS } from "../src/protocol.js";
import { resetToInitial } from "../src/presence.js";
import { S } from "../src/state.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};
const GATE = /never verified on real hardware/i;

console.log("[1] WE 族（XM2we / OP1we）：默认写入必须关闭");
{
  ok(WE_WRITES_ENABLED === false, "总闸默认为 false");
  const fakeDev: any = { addEventListener() {}, sendFeatureReport: async () => {}, opened: true };
  const sess = new Xm2weSession(fakeDev);
  const cases: any[] = [["writeRecord", [0x00, [0x01, 0x54]]], ["writeCpiSlot", [1, 800, 800]],
                        ["writePolling", [1000]], ["writeDebounce", [8]]];
  for (const [fn, args] of cases) {
    let msg = "";
    try { await (sess as any)[fn](...args); } catch (e: any) { msg = String(e.message); }
    ok(GATE.test(msg), `${fn}() 在闸门处抛错（不会碰到设备）`, msg);
  }
  // 反向验证：闸门一旦打开，报错必须换成"闸门之外"的原因（这里用越界地址制造）
  setWeWrites(true);
  let opened = "";
  try { await sess.writeRecord(0xB5, [0x01]); } catch (e: any) { opened = String(e.message); }
  ok(!GATE.test(opened) && /地址超出配置区/.test(opened),
     "setWeWrites(true) 之后闸门确实打开（报错来自下一层校验）", opened);
  setWeWrites(false);
  ok(WE_WRITES_ENABLED === false, "可以再关回去");
}

console.log("\n[2] 8k 有线族：未经确认必须拦截（含 guard4k(false) 的恢复出厂）");
{
  S.xm1 = false; S.eightK = true; S.family4 = false; S.unverified = false;
  S.unknownModel = false; S.betaArmed = false;
  S.blob = new Uint8Array(1024); S.gen = null; S.dev = {} as any;
  for (const need of [true, false]) {
    let msg = "";
    try { guard4k(need); } catch (e: any) { msg = String(e.message); }
    ok(/declined|disabled/i.test(msg), `guard4k(${need}) 未确认即拦截`, msg || "未拦截");
  }
  // 反向验证：拿到许可后放行（Node 里没有 confirm，只能直接置位来模拟"用户点过确认"）
  S.betaArmed = true;
  let armedMsg = "";
  try { guard4k(true); } catch (e: any) { armedMsg = String(e.message); }
  ok(armedMsg === "", "S.betaArmed=true 后放行", armedMsg);
}

console.log("\n[3] 实验许可必须随连接收回");
{
  S.betaArmed = true;
  resetToInitial("devGone", "test");
  ok(S.betaArmed === false, "resetToInitial 清掉 betaArmed");
}

console.log("\n[4] 只按「同工具同族」推断出来的 PID 必须标未验证");
{
  for (const pid of [0x1967, 0x1971, 0x1983, 0x1969]) {
    const row: any = MOUSE_PIDS[pid];
    ok(!!row && row[2] === 0, `0x${pid.toString(16)} → verified=0`, JSON.stringify(row));
  }
  for (const pid of [0x1968, 0x1972, 0x1982, 0x1984]) {
    const row: any = MOUSE_PIDS[pid];
    ok(!!row && row[2] !== 0, `0x${pid.toString(16)} 保持可写`, JSON.stringify(row));
  }
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);
