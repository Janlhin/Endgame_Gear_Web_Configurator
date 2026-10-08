/** 配置 blob 的解析与编码 —— 纯逻辑，不碰 DOM、不发报文。
 *
 *  4k 族与 8k 族的 blob 偏移逐字节相同，故共用这些函数（差别只在写命令与
 *  「档位/回报率」的取值域）。XM1 的线上布局同构，但字段语义未逐字节核实，
 *  因此 xm1Parse 只做「不猜」的解析：整体带出原始字节供显示与导出对照。
 */
import { S, newStage } from "./state.js";
import { XM1_MAX_STAGES } from "./protocol.js";

export function looksLikeBlob(b: Uint8Array, isXm1Dev = false) {
  if (isXm1Dev) {
    // XM1 无已知语义锚点，只排除全 0 / 全 FF 这两类明显无效
    let nonZero = 0, nonFF = 0;
    for (let i = 0; i < b.length; i++) { if (b[i] !== 0) nonZero++; if (b[i] !== 0xFF) nonFF++; }
    return nonZero > 16 && nonFF > 16;
  }
  return (b[0x0E] >= 1 && b[0x0E] <= 4) && [0x02, 0x04, 0x08, 0x40, 0x80].includes(b[0x05]);
}

export function looksLikeBlob8k(b: Uint8Array) {
  if (b.length < 131) return false;
  const levels = b[0x0E], active = b[0x0D], polling = b[0x05];
  const cpi1 = b[0x24] | (b[0x25] << 8);
  return levels >= 1 && levels <= 4 && active <= 3
      && polling >= 1 && polling <= 64 && cpi1 >= 10 && cpi1 <= 30000;
}

export function lodByteToMm(v, glass) {
  if (S.gen === 1) return v === 1 ? 1.0 : 2.0;
  if (glass) return v === 1 ? 1.0 : 2.0;
  return (v + 7) / 10;
}

export function mmToLodByte(mm, glass) {
  if (S.gen === 1 || glass) return Math.round(mm);
  return Math.round(mm * 10) - 7;
}

export function parseBlob() {
  const b = S.blob; const s: any = newStage();

  /* XM1（VID 0x22D4）：blob 布局与 4k 族同构，但字段语义**尚未逐字节核实**
     ——官方内部布局与线上布局之间还有一层重排（函数 0x40FD60，298 条搬运）。
     因此这里只做「不猜」的解析：把原始字节整体带出，供界面显示与导出对照，
     绝不按 4k 的偏移猜测并回写（写错会永久损坏鼠标配置）。 */
  if (S.xm1) {
    s.raw = b;
    s.levels = XM1_MAX_STAGES;                 // XM1 为 4 档（官方 UI 有 4 张 CPI 卡片）
    s.active = 1;
    s.unknown = true;                          // 标记：UI 应转为只读视图
    S.stage = s;
    return;
  }

  s.angleTune = (b[0x01] << 24) >> 24;
  s.unk7 = b[0x07];                                 // 0x14 帧 p[0] 透传的未知标志（OP1-WebAPP: "carried by 0x14, unread by Basic tab"）
  s.deepSleep = b[0x03] & 0x7F; if (b[0x03] & 0x80) s.deepSleep = "off";
  s.powerSaving = b[0x04] & 0x7F; if (b[0x04] & 0x80) s.powerSaving = "off";
  s.polling = b[0x05];
  s.flags = b[0x06];
  s.ledLiftoff = b[0x08] ? 1 : 0;
  s.lod = b[0x09];
  s.angleSnap = b[0x0A] ? 1 : 0;
  s.ripple = b[0x0B] ? 1 : 0;
  s.motionSync = b[0x0C] ? 1 : 0;
  s.active = b[0x0D] & 3;
  s.levels = Math.min(4, Math.max(1, b[0x0E]));
  for (let n = 0; n < 4; n++) {
    const o = 0x23 + 5 * n;
    s.cpi[n] = [b[o], b[o+1] | (b[o+2] << 8), b[o+3] | (b[o+4] << 8)];
  }
  s.buttons = [];
  for (let n = 0; n < 8; n++) {
    const o = 0x37 + 7 * n;
    s.buttons.push({ type: b[o], code: b[o+1], key: b[o+2], filter: b[o+6] });
  }
  s.glass = (S.gen === 2 && b[0x6F]) ? 1 : 0;
  s.lodMM = lodByteToMm(s.lod, s.glass);
  S.stage = s;
}

export function buildSensorPayload() {
  const p = new Uint8Array(28);
  p[0] = S.stage.unk7 ?? 0;                           // 透传 blob[7]（勿清零——语义未知，官方工具原样回写）
  p[1] = S.stage.ledLiftoff;
  p[2] = mmToLodByte(S.stage.lodMM, S.stage.glass);
  p[3] = S.stage.angleSnap; p[4] = S.stage.ripple;
  p[5] = S.gen === 2 ? (S.stage.angleTune & 0xFF) : 0;
  p[6] = S.stage.levels;
  p[7] = S.stage.active;
  for (let n = 0; n < 4; n++) {
    const o = 8 + 5 * n;
    const xyOn = S.stage.cpi[n][0] ? 1 : 0;
    const x = S.stage.cpi[n][1] | 0;
    /* ★ 未启用独立 → Y 必须等于 X（官方单值语义）。
       即使 UI 被绕过，写出去的报文也是自洽的。 */
    const y = xyOn ? (S.stage.cpi[n][2] | 0) : x;
    p[o] = xyOn;
    p[o+1] = x & 0xFF; p[o+2] = (x >> 8) & 0xFF;
    p[o+3] = y & 0xFF; p[o+4] = (y >> 8) & 0xFF;
  }
  return p;
}

export function buildPowerPayload() {
  const p = new Uint8Array(11);
  p[0] = S.stage.motionSync;
  p[1] = S.stage.polling;
  let f = 0;
  if (S.stage.slamclick) f |= 1;
  if (S.gen === 1 && S.stage.jitter) f |= 0x10;
  if (S.gen === 2 && S.stage.multiclick) f |= 0x20;
  if (S.gen === 2 && S.stage.maxFps) f |= 0x40;
  p[2] = f;
  p[3] = S.stage.powerSaving === "off" ? 0x80 : S.stage.powerSaving;
  for (let i = 0; i < 5; i++) p[4 + i] = S.stage.filters[i];
  p[9] = S.stage.deepSleep === "off" ? 0x80 : S.stage.deepSleep;
  p[10] = S.gen === 2 ? S.stage.glass : 0;
  return p;
}

export function xm1Parse(b) {
  const u16 = (o) => b[o] | (b[o + 1] << 8);
  const lodRaw = b[XM1_F.lod];
  return {
    active: b[XM1_F.active],
    lodRaw, lodMM: xm1LodToMm(lodRaw),
    ripple: b[XM1_F.ripple] ? 1 : 0,
    stages: XM1_F.stages.map((s, i) => ({
      idx: i, on: b[s.flag] === XM1_STAGE_ON, x: u16(s.x), y: u16(s.y),
    })),
  };
}


/* ★★ XM1 字段偏移表（**内部布局**）
 *
 * 全部由 2026-10-09 的三次真机差分实测确认（方法：官方软件改一个值 → 导出
 * → 与上一份 blob 逐字节对比，变化的字节即字段偏移）。证据见 re/XM1_NOTES.md 6.7。
 *
 * 差分记录：
 *   ① CPI：改一档 800→1150，仅 0x03D-0x040 变化 → 每档 [X:u16][Y:u16]，小端无缩放
 *   ② 启用/激活：档2 关、档1 开 → 0x03C 00→ff、0x033 ff→00、0x032 01→00
 *   ③ Lift Cut-Off 3mm→2mm → 0x046 0b→06
 *   ④ Ripple Control 开 → 0x057 00→01
 */
export const XM1_F = {
  active: 0x032,      // 当前激活档索引，0-based（0–3）；官方显示"档 N 为 On"即 N-1
  lod:    0x046,      // Lift Cut-Off：编码 = 5×mm − 4（实测 3mm=0x0B、2mm=0x06）
  ripple: 0x057,      // Ripple Control：00=Off，01=On
  stages: [           // 4 档，每档 [启用标志:1][X:u16 LE][Y:u16 LE]
    { flag: 0x033, x: 0x034, y: 0x036 },
    { flag: 0x03C, x: 0x03D, y: 0x03F },
    { flag: 0x051, x: 0x052, y: 0x054 },
    { flag: 0x05B, x: 0x05C, y: 0x05E },
  ],
};
/* 实测：启用标志 0x00 = On，0xFF = Off（与直觉相反，但两次差分均一致） */
export const XM1_STAGE_ON = 0x00;
/** Lift Cut-Off 编码 ⇄ 毫米（实测 3mm=11、2mm=6 ⇒ 5×mm−4） */
export const xm1LodToMm = (raw) => raw ? (raw + 4) / 5 : 0;
export const xm1MmToLod = (mm) => Math.round(mm * 5) - 4;
