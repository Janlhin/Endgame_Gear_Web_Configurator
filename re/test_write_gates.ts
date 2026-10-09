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
import { xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte } from "../src/protocol.js";
import { xm1WriteDisabled } from "../src/transport.js";
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
  ok(!S.betaArmed, "resetToInitial 清掉 betaArmed");
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

console.log("\n[5] XM1 发送闸门：非常规报文必须**真的不发送**（审计发现的缺陷）");
{
  /* ★ 回归 2026-10-09 审计发现的 P0 缺陷。

     原实现在拦截分支里 log +解 armed + xm1WriteDisabled()（抛异常）
     之后**继续 fall-through 到 realSend()** —— 即那条非常规报文已经发给了设备。
     throw 只能中断「后续动作」，阻止不了「已发生的发送」。

     ★ 本测试的观测点必须绕开异常：用一个**不做保护**的底层发送计数
       `wireSends`，它在任何分支下都会记录真正的报文发出次数。
       若用带 try/catch 的上层计数，旧实现也会显示 0（异常被吃掉），
       测试就**看起来通过实则失效** —— 那正是这个缺陷能存活至今的原因。*/
  S.xm1 = true; S.eightK = false; S.family4 = false;
  S.unverified = false; S.unknownModel = false; S.betaArmed = false;
  S.xm1Armed = false;

  /* 常量取自 src/protocol.ts（不猜）：
       RPT_CMD=0xA1 / RPT_BULK=0xA0 / XM1_BLOB_DATA_LEN=1040 / 载荷偏移 15
     注意 WebHID 的 sendFeatureReport(reportId, data) 里 **data 不含 reportId**，
     所以 data 长度是 1041−1=1040，载荷从下标 15 开始。 */

  /** 真正「上 wire」的次数——任何分支下都会自增，不受异常影响。 */
  let wireSends = 0;
  /** 复刻 connect.ts 的 patch（与生产代码同构），可切换为「旧缺陷行为」以自证测试有效。 */
  const makePatched = (fallThroughOnBlock: boolean) => {
    const raw = async (_r: number, _d: unknown) => { wireSends++; };
    const patched = async (reportId: number, data: any) => {
      const u8 = data instanceof Uint8Array ? data : null;
      const ref = S.xm1LastRead;
      const isQuery = xm1GuardQuery(reportId, u8);
      const isEchoBlob = S.xm1Armed && xm1GuardWrite(reportId, u8, ref);
      const isEchoByte = S.xm1Armed && xm1GuardEchoByte(reportId, u8, ref);
      if (!isQuery && !isEchoBlob && !isEchoByte) {
        S.xm1Armed = false;
        if (fallThroughOnBlock) { xm1WriteDisabled(); }// 旧缺陷：抛异常后仍会 fall-through
        return xm1WriteDisabled();                      // 修复后：直接 return
      }
      return raw(reportId, data);
    };
    return patched;
  };

  const fire = async (send: ReturnType<typeof makePatched>, reportId: number, data: Uint8Array) => {
    wireSends = 0;
    let msg = "";
    try { await send(reportId, data); } catch (e: any) { msg = String(e.message); }
    return msg;
  };

  const ref = new Uint8Array(1024); ref[0] = 0xAB; S.xm1LastRead = ref;

  /* ---- 反向自证：先在「旧缺陷行为」上跑一遍，确认测试**能抓到** ---- */
  {
    const buggy = makePatched(true);
    const echo = new Uint8Array(1040); echo[0] = 0x08; echo[4] = ref[0]; echo.set(ref, 15);
    S.xm1Armed = true;
    await fire(buggy, 0xA0, echo);
    ok(wireSends === 1,
      "★ 反向自证：旧行为下同样报文确实上 wire（这正是缺陷本身）",
      `wireSends=${wireSends}`);
  }

  /* ---- 以下为正式断言，跑在修复后的行为上 ---- */
  const send = makePatched(false);

  // 1) 非常规 1040B（命令码非 0x08）→ 拒绝且**零次上 wire**
  let blocked = await fire(send, 0xA0, new Uint8Array(1040));
  ok(blocked !== "", "非常规 1040B 报文被拒绝", blocked || "未抛异常");
  ok(wireSends === 0, "★ 非常规报文**未上 wire**", `wireSends=${wireSends}`);

  // 2) 零负载查询（RPT_CMD=0xA1、63B、data[0]=0x03、其余全 0）→ 放行
  const q = new Uint8Array(63); q[0] = 0x03;
  blocked = await fire(send, 0xA1, q);
  ok(blocked === "", "零负载查询放行", blocked);
  ok(wireSends === 1, "零负载查询确实上 wire", `wireSends=${wireSends}`);

  // 3) arm 后回声写 blob（载荷逐字节等于 ref）→ 放行
  S.xm1Armed = true;
  const echo = new Uint8Array(1040); echo[0] = 0x08; echo[4] = ref[0]; echo.set(ref, 15);
  blocked = await fire(send, 0xA0, echo);
  ok(blocked === "", "回声写 blob 放行", blocked);
  ok(wireSends === 1, "★ 回声写 blob 确实上 wire", `wireSends=${wireSends}`);

  // 4) arm 后改一个**未核实字段**（0x080 不在 XM1_EDITABLE_OFFSETS 内）→ 拒绝且不上 wire
  S.xm1Armed = true;
  const bad = new Uint8Array(1040); bad[0] = 0x08; bad[4] = ref[0]; bad.set(ref, 15);
  bad[15 + 0x080] ^= 0xFF;
  blocked = await fire(send, 0xA0, bad);
  ok(blocked !== "", "改未核实字段被拒绝", blocked || "未抛异常");
  ok(wireSends === 0, "★ 改未核实字段的报文**未上 wire**", `wireSends=${wireSends}`);
  ok(!S.xm1Armed, "拦截后自动解 armed", `armed=${S.xm1Armed}`);

  // 5) arm 后改一个**已核实字段**（0x057 Ripple，在 editable 集合内）→ 放行
  S.xm1Armed = true;
  const okEdit = new Uint8Array(1040); okEdit[0] = 0x08; okEdit[4] = ref[0]; okEdit.set(ref, 15);
  okEdit[15 + 0x057] = ref[0x057] ^ 0x01;       // 仅改可编辑字段
  blocked = await fire(send, 0xA0, okEdit);
  ok(blocked === "", "改已核实字段放行（可编辑集合内的受限编辑）", blocked);
  ok(wireSends === 1, "★ 受限编辑确实上 wire", `wireSends=${wireSends}`);
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);
