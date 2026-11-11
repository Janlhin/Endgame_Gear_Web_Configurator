// verifyPerf 的离线回归测试。
//
// 由来（2026-11-11）：一次真实写入后界面报「写入后回读不一致（设备未接受下列项）：Jitter filter」，
// 但设备其实接受了。原因是 verifyPerf 里
//     w.jitter !== (f & 0x10 ? 1 : 0)
// 左边是布尔（snapPerf 返回 !!(...)），右边是数字，严格比较恒为不等 ——
// 所以只要 S.gen === 1，这一项**必然**报不一致，与设备状态无关。
//
// 本文件盯住两条性质：
//   ① 期望值与读回值一致时，**不得**报任何不一致（假阳性回归）；
//   ② 期望值与读回值真的不同时，必须报出来（不能为了消掉假阳性而把检查关死）。
import { S } from "../../src/state.js";
import { snapPerf, verifyPerf } from "../../src/verify.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

/* 把状态摆成一台 gen 1、jitter 位已置位、其余字段自洽的设备 */
function setupGen1(flags: number) {
  S.gen = 1;
  S.stage.flags = flags;
  S.stage.polling = 0x08;
  S.stage.motionSync = 1;              // 类型是 number（Stage.motionSync: number）
  S.stage.powerSaving = 1;             // MinutesOrOff = number | "off"
  S.stage.deepSleep = 3;
  S.stage.buttons = [
    { type: 0, code: 0, key: 0, filter: 0 },
    { type: 0, code: 0, key: 0, filter: 1 },
  ];
}

/* ① 期望值 = 读回值：不得有任何不一致 */
setupGen1(0x01 | 0x10);                   // slamclick + jitter 都在
{
  const want = snapPerf();                // 与当前状态同源
  const bad = verifyPerf(want);
  ok(bad.length === 0, "gen1：期望与读回一致时不报不一致", JSON.stringify(bad));
}

/* ① 的另一半：jitter 位为 0 时同样不得误报 */
setupGen1(0x01);                          // 只有 slamclick
{
  const want = snapPerf();
  const bad = verifyPerf(want);
  ok(bad.length === 0, "gen1：jitter 位为 0 时同样不误报", JSON.stringify(bad));
}

/* ② 真正的差异必须被抓到：期望 jitter=true，设备读回 jitter=false */
setupGen1(0x01);
{
  const want = snapPerf();
  want.jitter = true;                     // 我们写了「开」，设备回读是「关」
  const bad = verifyPerf(want);
  ok(bad.includes("Jitter filter"), "gen1：真实的 jitter 差异必须报出", JSON.stringify(bad));
}

/* ② 反向：期望 jitter=false，设备读回 jitter=true */
setupGen1(0x01 | 0x10);
{
  const want = snapPerf();
  want.jitter = false;
  const bad = verifyPerf(want);
  ok(bad.includes("Jitter filter"), "gen1：反向的真实差异也必须报出", JSON.stringify(bad));
}

/* gen 2 不检查 jitter（该位在 v2 是 multiclick），不应因 jitter 报错 */
{
  setupGen1(0x20);
  S.gen = 2;
  S.stage.flags = 0x20;
  const want = snapPerf();
  const bad = verifyPerf(want);
  ok(!bad.includes("Jitter filter"), "gen2：不因 jitter 报错", JSON.stringify(bad));
}

console.log(`\nverifyPerf 结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
