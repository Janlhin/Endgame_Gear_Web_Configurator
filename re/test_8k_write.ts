// 8k 有线族写入的离线回归测试。
//
// 由来：8k 的写是**整块覆盖**（0x11 STORE，一次写 1024B），因此它天然带有
// 「一个偏移写错就整块被改坏」的风险 —— 与 XM1 那次事故同一形态。
// 所以本文件盯住两条核心性质：
//   ① **只改该改的字节**：buildBlob8k 的输出与输入 blob 的差异，
//      必须恰好落在我们声明会改的偏移集合内（这条性质比"值对不对"更重要）；
//   ② 报文几何：A0 报告 / 1040 字节 data / 命令 0x11 / 载荷落位 / 报告 2..15 与尾字节透传。
import { buildBlob8k, build8kStoreData, OFF8K, MOUSE_PIDS, PID_8K, is8k,
         PID_FAMILY4, isFamily4, RPT_BULK } from "../src/protocol.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

/* 声明「允许被 buildBlob8k 改动」的偏移集合 —— 与实现同源的唯一真值。
   写成显式列表而不是从实现里推导，否则测试会跟着实现一起错。 */
const EDITABLE = new Set<number>();
EDITABLE.add(OFF8K.polling);
EDITABLE.add(OFF8K.flags);
EDITABLE.add(OFF8K.angleSnap);
EDITABLE.add(OFF8K.ripple);
EDITABLE.add(OFF8K.motionSync);
EDITABLE.add(OFF8K.active);
EDITABLE.add(OFF8K.levels);
for (let n = 0; n < 4; n++) for (let k = 0; k < 5; k++) EDITABLE.add(OFF8K.cpi + 5 * n + k);

/* 一份"处处都有值"的基准 blob：任何未被改动的字节只要变成 0 或别的值就会被抓到。 */
function makeBase(): Uint8Array {
  const b = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) b[i] = (i * 7 + 3) & 0xFF;   // 无零、无明显周期
  b[OFF8K.polling] = 0x08;      // 1000 Hz
  b[OFF8K.flags]   = 0x01 | 0x10 | 0x20;   // slamclick + jitter + 一个我们不管的位(0x20)
  b[OFF8K.levels]  = 2;
  b[OFF8K.active]  = 1;
  for (let n = 0; n < 4; n++) {
    const o = OFF8K.cpi + 5 * n;
    b[o] = 0; b[o + 1] = 0x20; b[o + 2] = 0x03; b[o + 3] = 0x20; b[o + 4] = 0x03;   // 800/800
  }
  return b;
}

function makeStage() {
  return {
    cpi: [[1, 1600, 3200], [0, 800, 800], [0, 2400, 2400], [0, 400, 400]],
    levels: 3, active: 2,
    polling: 0x02, motionSync: 1,
    angleSnap: 1, ripple: 0,
    flags: 0x01 | 0x10,           // 与 render() 维护的表示一致
    slamclick: 1, jitter: 1,      // 显式字段（UI 编辑路径用的就是它）
  };
}

console.log("\n[1] 8k 设备表");
ok(PID_8K[0x1966] !== undefined && PID_8K[0x1964] !== undefined
   && PID_8K[0x1980] !== undefined && PID_8K[0x1978] !== undefined, "四个 8k PID 都在表内");
ok(is8k(0x1966) && is8k(0x1978), "is8k() 正确判定");
ok(!is8k(0x1968) && !is8k(0x1970), "4k 的 PID 不被判为 8k");
ok(MOUSE_PIDS[0x1966][2] !== 0, "8k 条目不再是 verified=0（已有真实写路径）");
ok(PID_FAMILY4[0x1903] && PID_FAMILY4[0x1910] && isFamily4(0x1905), "第四族 PID 表与判定");
ok(!isFamily4(0x1966) && !isFamily4(0x1968), "第四族判定不误伤其它族");

console.log("\n[2] 只改该改的字节（核心性质）");
{
  const base = makeBase();
  const st = makeStage();
  const out = buildBlob8k(base, st);
  const changed: number[] = [];
  for (let i = 0; i < 1024; i++) if (out[i] !== base[i]) changed.push(i);
  const outOfScope = changed.filter(i => !EDITABLE.has(i));
  ok(outOfScope.length === 0,
     "改动全部落在声明范围内", "越界偏移: " + outOfScope.map(i => "0x" + i.toString(16)).join(","));
  ok(changed.length > 0, "确实发生了改动（否则测试无意义）");
  ok(out.length === 1024, "输出仍是 1024 字节");
  ok(base[0x80] === out[0x80] && base[0x3D] === out[0x3D] && base[0x6F] === out[0x6F],
     "未涉及区域（0x80 / 按键区 0x3D / 玻璃面 0x6F）逐字节保持原值");
}

console.log("\n[3] 字段值正确落位");
{
  const base = makeBase();
  const st = makeStage();
  const out = buildBlob8k(base, st);
  ok(out[OFF8K.polling] === 0x02, "polling = 0x02（4000 Hz）");
  ok(out[OFF8K.levels] === 3, "levels = 3");
  ok(out[OFF8K.active] === 2, "active = 2");
  ok(out[OFF8K.angleSnap] === 1 && out[OFF8K.ripple] === 0, "angleSnap / ripple");
  ok(out[OFF8K.motionSync] === 1, "motionSync = 1");
  // flags：slamclick+bit4 置位，而我们不管的 bit5(0x20) 必须保持
  ok((out[OFF8K.flags] & 0x01) === 0x01 && (out[OFF8K.flags] & 0x10) === 0x10,
     "显式 slamclick/jitter 字段 → 两个位被置位");
  /* 回退路径：只给 flags、不给显式字段时，必须按 flags 位处理，**不能清零** */
  const onlyFlags = buildBlob8k(base, { ...makeStage(), slamclick: undefined, jitter: undefined });
  ok((onlyFlags[OFF8K.flags] & 0x01) === 0x01 && (onlyFlags[OFF8K.flags] & 0x10) === 0x10,
     "只给 flags 时按位处理（不清零）");
  /* 显式关闭必须真的关闭 */
  const offBoth = buildBlob8k(base, { ...makeStage(), slamclick: 0, jitter: 0 });
  ok((offBoth[OFF8K.flags] & 0x11) === 0, "显式关闭 → 两个位被清除");
  ok((offBoth[OFF8K.flags] & 0x20) === 0x20, "关闭时仍保留不归我们管的位");
  ok((out[OFF8K.flags] & 0x20) === 0x20, "未归我们管的 flags 位被保留（不清零）");
  // CPI：第 0 档 XY 独立 1600/3200；第 1 档未启用独立 ⇒ Y 必须等于 X
  const o0 = OFF8K.cpi, o1 = OFF8K.cpi + 5;
  ok(out[o0] === 1 && (out[o0 + 1] | (out[o0 + 2] << 8)) === 1600 && (out[o0 + 3] | (out[o0 + 4] << 8)) === 3200,
     "CPI1 = XY独立 1600/3200");
  ok(out[o1] === 0 && (out[o1 + 1] | (out[o1 + 2] << 8)) === 800 && (out[o1 + 3] | (out[o1 + 4] << 8)) === 800,
     "CPI2 未启用独立 ⇒ Y 被强制等于 X");
}

console.log("\n[4] 报文几何（A0 / 1040 / 0x11 / 载荷落位 / 透传）");
{
  const frame = new Uint8Array(1041);
  for (let i = 0; i < 1041; i++) frame[i] = i & 0xFF;
  frame[0] = 0xA0;
  const nb = makeBase();
  const data = build8kStoreData(frame, nb);
  ok(data.length === 1040, "data 长度 = 1040（报告 1041 − reportId）");
  ok(data[0] === 0x11, "data[0] = 0x11（STORE，对应报告 [1]）");
  let passThrough = true;
  for (let i = 1; i <= 14; i++) if (data[i] !== frame[i + 1]) passThrough = false;
  ok(passThrough, "报告 [2..15] 原样透传");
  let payloadOk = true;
  for (let i = 0; i < 1024; i++) if (data[15 + i] !== nb[i]) payloadOk = false;
  ok(payloadOk, "1024B blob 落在 data[15..1038]（报告偏移 16）");
  ok(data[1039] === frame[1040], "尾字节透传（报告偏移 1040）");
  ok(RPT_BULK === 0xA0, "STORE 用的 reportId = 0xA0");
}

console.log("\n[5] 边界：levels / active 越界时被夹紧");
{
  const base = makeBase();
  const out1 = buildBlob8k(base, { ...makeStage(), levels: 9 });
  ok(out1[OFF8K.levels] === 4, "levels 9 → 夹到 4");
  const out2 = buildBlob8k(base, { ...makeStage(), levels: 0 });
  ok(out2[OFF8K.levels] === 1, "levels 0 → 夹到 1");
  const out3 = buildBlob8k(base, { ...makeStage(), active: 7 });
  ok(out3[OFF8K.active] === 3, "active 7 → 夹到 3");
}

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
if (fail) process.exitCode = 1;
