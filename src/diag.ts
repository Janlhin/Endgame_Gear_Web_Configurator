/** 测试数据包：把「判断一个型号能不能用」需要的一切一次导出。
 *
 *  给谁用：手里有我们没有的鼠标的远程志愿者（8k 有线全系、XM2we / OP1we）。
 *  他们原本要手动拼四样东西（型号 PID、固件版本、blob、通讯日志），漏一样就得再问一轮；
 *  现在一个按钮全带走，回报格式也内嵌在 `report` 字段里，照着填即可。
 *
 *  设计上刻意**不读硬件**（纯状态快照）：导出永远安全，也不会打断当前连接。
 *  WE 族走 `we` 字段（EEPROM 转储 + 解码表），4k/8k/XM1 走 `blob`。
 */
import { S } from "./state.js";

function hexDump(b: Uint8Array | null): string | null {
  if (!b || !b.length) return null;
  const rows: string[] = [];
  for (let o = 0; o < b.length; o += 16) {
    const row: string[] = [];
    for (let i = 0; i < 16 && o + i < b.length; i++) row.push(b[o + i].toString(16).padStart(2, "0"));
    rows.push(o.toString(16).padStart(4, "0") + ": " + row.join(" "));
  }
  return rows.join("\n");
}

function toB64(b: Uint8Array | null): string | null {
  if (!b || !b.length) return null;
  try {
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return (globalThis as any).btoa ? (globalThis as any).btoa(s) : null;
  } catch (_) { return null; }
}

function logText(): string {
  try {
    const d: any = (globalThis as any).document;
    const el = d && d.getElementById ? d.getElementById("log") : null;
    return el ? String(el.textContent || "") : "";
  } catch (_) { return ""; }
}

function familyOf(): string {
  if (S.xm1) return "xm1-2020";
  if (S.eightK) return "8k-wired";
  if (S.family4) return "family4-0xFFA1";
  return "4k-wireless";
}

/** 当前解析结果的快照（字段缺失一律给 null，绝不让导出因为一个字段炸掉） */
function parsed(): any {
  const st: any = (S as any).stage || {};
  return {
    cpi: Array.isArray(st.cpi) ? st.cpi.map((r: any) => ({ xySplit: !!(r && r[0]), x: r ? r[1] | 0 : null, y: r ? r[2] | 0 : null })) : null,
    levels: st.levels ?? null,
    activeStage: st.active ?? null,
    angleSnap: st.angleSnap ?? null,
    ripple: st.ripple ?? null,
    ledLiftoff: st.ledLiftoff ?? null,
    lodMM: st.lodMM ?? null,
    glassMode: st.glass ?? null,
    angleTune: st.angleTune ?? null,
    polling: st.polling ?? null,
    motionSync: st.motionSync ?? null,
    slamclick: st.slamclick ?? null,
    jitter: st.jitter ?? null,
    multiclick: st.multiclick ?? null,
    maxFps: st.maxFps ?? null,
    powerSaving: st.powerSaving ?? null,
    deepSleep: st.deepSleep ?? null,
    filters: Array.isArray(st.filters) ? st.filters.slice() : null,
    buttons: Array.isArray(st.buttons) ? st.buttons.map((b: any) => ({ type: b?.type, code: b?.code, key: b?.key, filter: b?.filter })) : null,
  };
}

export function buildDiag(extra: any = {}): any {
  const dev: any = S.dev || {};
  const cols = (dev.collections || []).map((c: any) => ({
    usagePage: c.usagePage, usage: c.usage,
    featureReports: Array.isArray(c.featureReports) ? c.featureReports.map((r: any) => r.reportId) : undefined,
  }));
  const env: any = (globalThis as any).navigator || {};
  return {
    app: "Endgame_Gear_Web_Configurator",
    schema: "diag/1",
    savedAt: new Date().toISOString(),
    purpose: "未验证型号的实测数据包 —— 请连同「改了什么、回读结果、手感是否真的变了」一起发回",
    env: {
      userAgent: env.userAgent || null,
      webhid: typeof env.hid !== "undefined",
      secureContext: (globalThis as any).window ? !!(globalThis as any).window.isSecureContext : null,
    },
    device: {
      productName: dev.productName || null,
      vendorId: dev.vendorId ?? null,
      productId: dev.productId ?? null,
      mouseName: S.mouseName || null,
      gen: S.gen ?? null,
      family: familyOf(),
      mouseFw: S.mouseFw ?? null,
      dongleFw: S.dongleFw ?? null,
      battery: S.battery ?? null,
      wired: !!S.wired,
      collections: cols,
    },
    /* 这几个标志决定"哪一族、能不能写" —— 判断型号归属时第一眼看的就是它们 */
    flags: {
      eightK: !!S.eightK, xm1: !!S.xm1, family4: !!S.family4,
      unverified: !!S.unverified, unknownModel: !!S.unknownModel,
      betaArmed: !!S.betaArmed,
    },
    parsed: parsed(),
    blob: S.blob ? { length: S.blob.length, b64: toB64(S.blob), hex: hexDump(S.blob) } : null,
    log: logText(),
    /* 回报模板：志愿者照着填，避免"发回来还要再问一轮" */
    report: {
      modelSeen: "",
      changed: "",        // 例：CPI 1：800 → 1600
      readBack: "",       // 页面提示"已回读校验通过"还是列出了不一致项
      feltDifferent: "",  // ★最关键：实际手感/速度真的变了吗
      notes: "",
    },
    ...extra,
  };
}

/** WE 族：EEPROM 转储 + 解码表（4k/8k 那套 blob 用不上） */
export function buildWeDiag(sess: any, model: string): any {
  let mem: any = null, tables: any = null, dump: string | null = null;
  try { mem = Object.fromEntries(sess.mem || new Map()); } catch (_) { mem = null; }
  try {
    tables = {
      cpi: sess.cpiTable ? sess.cpiTable() : null,
      keys: sess.keyTable ? sess.keyTable() : null,
      pollingHz: sess.polling ? sess.polling() : null,
      debounceMs: sess.debounce ? sess.debounce() : null,
      ledColors: sess.ledColors ? sess.ledColors() : null,
    };
  } catch (_) { tables = null; }
  try { dump = sess.dumpHex ? sess.dumpHex() : null; } catch (_) { dump = null; }
  return buildDiag({ we: { model, eeprom: mem, tables, dumpHex: dump } });
}
