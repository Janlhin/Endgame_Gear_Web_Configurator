/** 写入前的期望值快照 + 写入后的回读比对。
 *
 *  4k 族与 8k 族共用这一套（两者的 blob 偏移逐字节相同，差别只在写命令），
 *  所以独立成一层，避免 device-4k 与 device-8k 互相引用成环。
 *
 *  为什么是「语义比较」而不是字节比较：设备会对数值做规范化（例如把 LOD 折算、
 *  把越界的档位数夹紧），字节级比对必然误报。
 */
import { S } from "./state.js";
import { t } from "./i18n.js";
import { log, banner } from "./util.js";

export function snapSensor(): any {
  return {
    cpi: S.stage.cpi.map((r: number[]) => [r[0] ? 1 : 0, r[1] | 0, r[0] ? (r[2] | 0) : (r[1] | 0)]),
    levels: S.stage.levels | 0,
    active: S.stage.active | 0,
    angleSnap: S.stage.angleSnap ? 1 : 0,
    ripple: S.stage.ripple ? 1 : 0,
    ledLiftoff: S.stage.ledLiftoff ? 1 : 0,
    lodMM: +S.stage.lodMM,
    glass: S.stage.glass ? 1 : 0,
    angleTune: (S.stage.angleTune << 24) >> 24,
  };
}

export function verifySensor(w: any): string[] {
  const bad: string[] = [];
  for (let n = 0; n < 4; n++) {
    const a = S.stage.cpi[n] || [0, 0, 0];
    if (w.cpi[n][0] !== (a[0] ? 1 : 0)) bad.push(`CPI ${n + 1} XY-enable`);
    if (w.cpi[n][1] !== (a[1] | 0)) bad.push(`CPI ${n + 1} X ${w.cpi[n][1]}→${a[1] | 0}`);
    const wantY = w.cpi[n][0] ? w.cpi[n][2] : w.cpi[n][1];   // 未启用独立时从 X 取期望
    if (wantY !== (a[2] | 0)) bad.push(`CPI ${n + 1} Y ${wantY}→${a[2] | 0}`);
  }
  if (w.levels !== (S.stage.levels | 0)) bad.push(`Levels ${w.levels}→${S.stage.levels}`);
  if (S.gen === 2 && w.active !== (S.stage.active & 3)) bad.push(`Active stage ${w.active + 1}→${(S.stage.active & 3) + 1}`);
  if (w.angleSnap !== (S.stage.angleSnap ? 1 : 0)) bad.push("Angle Snap");
  if (w.ripple !== (S.stage.ripple ? 1 : 0)) bad.push("Ripple");
  if (w.ledLiftoff !== (S.stage.ledLiftoff ? 1 : 0)) bad.push("LED liftoff");
  if (Math.abs(w.lodMM - +S.stage.lodMM) > 0.05) bad.push(`LOD ${w.lodMM}mm→${S.stage.lodMM}mm`);
  if (S.gen === 2 && w.glass !== (S.stage.glass ? 1 : 0)) bad.push("Glass mode");
  if (S.gen === 2 && w.angleTune !== ((S.stage.angleTune << 24) >> 24)) bad.push("Angle Tune");
  return bad;
}

export function snapPerf(): any {
  const f = S.stage.flags | 0;
  return {
    polling: S.stage.polling, motionSync: S.stage.motionSync ? 1 : 0,
    slamclick: !!(f & 1), jitter: !!(f & 0x10),
    multiclick: !!(f & 0x20), maxFps: !!(f & 0x40),
    powerSaving: S.stage.powerSaving, deepSleep: S.stage.deepSleep,
    filters: (S.stage.filters || []).slice(),
  };
}

export function verifyPerf(w: any): string[] {
  const bad: string[] = [];
  const f = S.stage.flags | 0;
  if (w.polling !== S.stage.polling) bad.push(`Polling 0x${w.polling.toString(16)}→0x${S.stage.polling.toString(16)}`);
  if (w.motionSync !== (S.stage.motionSync ? 1 : 0)) bad.push("Motion Sync");
  if (w.slamclick !== !!(f & 1)) bad.push("Slamclick");
  if (S.gen === 1 && w.jitter !== (f & 0x10 ? 1 : 0)) bad.push("Jitter filter");
  if (S.gen === 2 && w.multiclick !== !!(f & 0x20)) bad.push("Multiclick");
  if (S.gen === 2 && w.maxFps !== !!(f & 0x40)) bad.push("Force max FPS");
  if (w.powerSaving !== S.stage.powerSaving) bad.push(`Power saving ${w.powerSaving}→${S.stage.powerSaving}`);
  if (w.deepSleep !== S.stage.deepSleep) bad.push(`Deep sleep ${w.deepSleep}→${S.stage.deepSleep}`);
  for (let i = 0; i < w.filters.length; i++)
    if (w.filters[i] !== S.stage.filters[i]) bad.push(`Filter ${i + 1} ${w.filters[i]}→${S.stage.filters[i]}`);
  return bad;
}

export function snapButtons(): any {
  return (S.stage.buttons || []).map((b: any) => ({ type: b.type, code: b.code, key: b.key, filter: b.filter }));
}

export function verifyButtons(w: any[]): string[] {
  const bad: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const a = (S.stage.buttons || [])[i];
    if (!a) { bad.push(`Button ${i + 1} missing`); continue; }
    if (w[i].type !== a.type || w[i].code !== a.code || w[i].key !== a.key)
      bad.push(`Button ${i + 1} mapping`);
    if (w[i].filter !== a.filter) bad.push(`Button ${i + 1} filter ${w[i].filter}→${a.filter}`);
  }
  return bad;
}

export function reportVerify(okKey: string, bad: string[]) {
  if (bad.length) {
    banner("warn", t("verifyFail") + bad.join("、"));
    log("⋯ 回读校验不一致（" + bad.length + " 项）：" + bad.join("、"));
  } else {
    banner("ok", t(okKey) + " · " + t("verifyOk"));
    log("✓ 回读校验通过：" + t(okKey));
  }
}

