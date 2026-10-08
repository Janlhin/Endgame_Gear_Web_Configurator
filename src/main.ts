// 应用主体：全局状态 / 传输层 / blob 读写解析 / UI 渲染 / 连接与事件绑定
import { $, sleep, hex, log, banner } from "./util.js";
import { I18N, LANG, t, applyI18n } from "./i18n.js";
import { VID, DONGLE_PID, MOUSE_PIDS, RPT_CMD, RPT_BULK, POLLING_LABELS } from "./protocol.js";
import { isXm2weFamily, WE_MOUSE_PID, WE_DONGLE_PID } from "./xm2we.js";
import { openXm2we, closeXm2we, refreshWe, bindXm2weUI, isXm2weOpen } from "./xm2we-ui.js";

// —— 语言切换时重渲染（i18n.ts 通过事件解耦） ——
document.addEventListener("langchange", () => render());

const STAGE_COLORS = { "zh-CN": ["蓝", "绿", "黄", "红"], "en": ["Blue", "Green", "Yellow", "Red"] };
const BTN_NAMES = { "zh-CN": ["左键", "右键", "中键", "后退", "前进", "特殊(CPI)", "滚轮上", "滚轮下"],
                    "en": ["Left", "Right", "Middle", "Back", "Forward", "Special (CPI)", "Wheel up", "Wheel down"] };
const FILTER_OPTS = [["off","off"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["11","11"],["12","12"],["13","13"],["14","14"],["15","15"]];


let dev = null, queue = Promise.resolve(), lastFail = false;
let gen = null, mouseName = "—";
let blob = null;
let dongleFw = "—", mouseFw = "—", battery = null, wired = false;
let stage: any = newS();

function newS() {
  return { cpi: [[0,400,400],[0,800,800],[0,1600,1600],[0,3200,3200]], levels: 4, active: 1,
           lod: 3, lodMM: 1.0, glass: 0, angleSnap: 0, ripple: 0, angleTune: 0, ledLiftoff: 1,
           motionSync: 0, polling: 0x08, flags: 0, powerSaving: 1, deepSleep: 3,
           filters: [8,8,8,8,8], buttons: [] };
}

function setConn(on, text) { const p = $("connState"); p.className = "status-pill" + (on ? "" : " off"); p.textContent = text; }

/* ================= 传输层 ================= */
/* rawReceive 归一化：Chrome 各平台对 receiveFeatureReport 的返回不一致——
   可能带 reportId、剥掉 reportId（payload-only）、或把 reportId 置 0（零占位）。
   参考 qsxcv/UnofficialEGGWebConfig 的 eggNormalizeFeature（re/upstream/）。
   v2 固件的 0xA0 响应首字节是 0xA1 回显，由 readBlob 的双格式分支处理。 */
async function rawReceive(reportId) {
  const d = await dev.receiveFeatureReport(reportId);
  let u8 = new Uint8Array(d.buffer);
  if (u8.length && u8[0] === 0x00) u8 = u8.slice(1);              // 零占位 → 丢弃
  if (u8.length && u8[0] === reportId) return u8;                 // 已含 reportId
  const out = new Uint8Array(u8.length + 1); out[0] = reportId; out.set(u8, 1); return out;
}
async function transact(cmd, target = 0x00, payload = null, opt: any = {}) {
  const run = async () => {
    const buf = new Uint8Array(63);                  // sendFeatureReport 的 data 不含 reportId
    buf[0] = cmd; buf[1] = target;
    buf[2] = opt.lenByte !== undefined ? opt.lenByte : (payload ? payload.length : 0);
    if (opt.chunk) buf[6] = opt.chunk;
    if (payload) buf.set(payload, 15);               // 报告内偏移 16 = 去掉 ID 后的 15
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await dev.sendFeatureReport(RPT_CMD, buf); }
      catch (e) { log(`✗ SET fail (cmd 0x${cmd.toString(16)}): ${e.message}`); if (attempt === 3) throw e; await sleep(60); continue; }
      await sleep(opt.pace || 170);
      let u8;
      try { u8 = await rawReceive(RPT_CMD); }
      catch (e) { log(`✗ GET fail: ${e.message}`); if (attempt === 3) throw e; await sleep(60); continue; }
      const status = u8[1];
      if (status === 0x01) { lastFail = false; return u8; }
      if (status === 0x03) { log(`⋯ busy, retry #${attempt + 1}`); await sleep(200 * (attempt + 1)); continue; }
      lastFail = true;
      const map = { 0x07: "N/A on this connection", 0x08: "mouse asleep/unreachable", 0x11: "mouse asleep/unreachable" };
      log(`✗ cmd 0x${cmd.toString(16)} status=0x${status.toString(16)} (${map[status] || "unknown"})`);
      throw new StatusError(status, map[status] || "device error 0x" + status.toString(16));
    }
    throw new StatusError(0x03, "device stays busy");
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
class StatusError extends Error { code: any; constructor(code: any, msg: string) { super(msg); this.code = code; } }
/* 探测/唤醒。0x0F 是**无线专属**唤醒（官方仅 0x22 路径唤醒，见 re/PROTOCOL_NOTES.md）：
   有线直连时发 0x0F 两个变体都会回状态 7，且会让后续写入被 ACK 后静默丢弃
   （zexsso/OP1-WebAPP device.ts 真机验证）。有线直接走 0x0E 读鼠标信息。 */
async function probe() {
  if (!wired) {
    try { await transact(0x0F, 0x01, null, { pace: 120 }); return; } catch (e) { /* 试下一变体 */ }
    try { await transact(0x0F, 0x0F, null, { pace: 120 }); return; } catch (e) { /* 落到 0x0E */ }
  }
  await transact(0x0E, 0x00, null, { pace: 120 });
}
async function guarded(cmd, target, payload: any = null, opt: any = {}) {
  if (lastFail) { try { await probe(); } catch (e) { throw new StatusError(0x08, "mouse unreachable — move it and retry"); } }
  return transact(cmd, target, payload, opt);
}
/* 读 1024B 配置 blob。两种响应格式（真机证据见 re/PROTOCOL_NOTES.md）：
   v1: [0xA0][status@1][保留×14][blob@16]
   v2: [0xA0][回显0xA1@1][status@2][保留×14][blob@17] —— v2 固件在 0xA0 报告里回显请求报告 ID，
       导致 v1 格式在 [1] 读到 0xA1 而误判"未备好"（此前误诊为时序问题，重试无效）。 */
function looksLikeBlob(b: Uint8Array) {
  return (b[0x0E] >= 1 && b[0x0E] <= 4) && [0x02, 0x04, 0x08, 0x40, 0x80].includes(b[0x05]);
}
async function readBlob() {
  let lastDump = "";
  for (let round = 1; round <= 4; round++) {
    await guarded(0x12, 0x00, null, { pace: 250 });
    for (let i = 0; i < 3; i++) {
      const u8 = await rawReceive(RPT_BULK);
      let status = u8[1], off = 16;
      if (u8[1] === 0xA1 && u8[2] === 0x01) { status = 0x01; off = 17; }  // v2 回显格式
      if (status === 0x01 && u8.length >= off + 1024) {
        const cand = u8.slice(off, off + 1024);
        if (looksLikeBlob(cand)) {
          blob = cand;
          log(`✓ blob read OK (${blob.length} B @off ${off}, round ${round})  head: ${hex(blob, 16)}`);
          return;
        }
        // 校验未过（疑似陈旧缓存）：按未就绪处理，继续重试
        lastDump = hex(cand, 32);
        log(`⋯ blob 校验未过 (levels=0x${cand[0x0E].toString(16)} polling=0x${cand[0x05].toString(16)}), round ${round}, head: ${lastDump}`);
        break;
      }
      if (status === 0x03) { log(`⋯ blob busy, retry #${i + 1}`); await sleep(280); continue; }
      lastDump = hex(u8, 32);
      log(`⋯ 0xA0 not ready (status=0x${u8[1].toString(16)}), round ${round}, head: ${lastDump}`);
      break;
    }
    await sleep(300);
  }
  throw new Error(`blob read failed after 4 rounds; last head: ${lastDump}`);
}

/* ================= blob 解析 / 编码 ================= */
function parseBlob() {
  const b = blob; const s: any = newS();
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
  s.glass = (gen === 2 && b[0x6F]) ? 1 : 0;
  s.lodMM = lodByteToMm(s.lod, s.glass);
  stage = s;
}
function lodByteToMm(v, glass) {
  if (gen === 1) return v === 1 ? 1.0 : 2.0;
  if (glass) return v === 1 ? 1.0 : 2.0;
  return (v + 7) / 10;
}
function mmToLodByte(mm, glass) {
  if (gen === 1 || glass) return Math.round(mm);
  return Math.round(mm * 10) - 7;
}
function buildSensorPayload() {
  const p = new Uint8Array(28);
  p[0] = stage.unk7 ?? 0;                           // 透传 blob[7]（勿清零——语义未知，官方工具原样回写）
  p[1] = stage.ledLiftoff;
  p[2] = mmToLodByte(stage.lodMM, stage.glass);
  p[3] = stage.angleSnap; p[4] = stage.ripple;
  p[5] = gen === 2 ? (stage.angleTune & 0xFF) : 0;
  p[6] = stage.levels;
  p[7] = stage.active;
  for (let n = 0; n < 4; n++) {
    const o = 8 + 5 * n;
    p[o] = stage.cpi[n][0];
    p[o+1] = stage.cpi[n][1] & 0xFF; p[o+2] = stage.cpi[n][1] >> 8;
    p[o+3] = stage.cpi[n][2] & 0xFF; p[o+4] = stage.cpi[n][2] >> 8;
  }
  return p;
}
function buildPowerPayload() {
  const p = new Uint8Array(11);
  p[0] = stage.motionSync;
  p[1] = stage.polling;
  let f = 0;
  if (stage.slamclick) f |= 1;
  if (gen === 1 && stage.jitter) f |= 0x10;
  if (gen === 2 && stage.multiclick) f |= 0x20;
  if (gen === 2 && stage.maxFps) f |= 0x40;
  p[2] = f;
  p[3] = stage.powerSaving === "off" ? 0x80 : stage.powerSaving;
  for (let i = 0; i < 5; i++) p[4 + i] = stage.filters[i];
  p[9] = stage.deepSleep === "off" ? 0x80 : stage.deepSleep;
  p[10] = gen === 2 ? stage.glass : 0;
  return p;
}

/* ================= UI 渲染 ================= */
function fillSelect(sel, opts, val) {
  sel.innerHTML = "";
  for (const [v, tt] of opts) {
    const o = document.createElement("option"); o.value = v; o.textContent = tt; sel.appendChild(o);
  }
  sel.value = String(val);
}
function render() {
  $("iModel").textContent = mouseName;
  $("iMouseFw").textContent = mouseFw;
  $("iDongleFw").textContent = wired ? t("noDongleWired") : dongleFw;
  $("iBattery").textContent = battery === null ? "—"
    : (wired && battery < 100 ? t("charging", battery) : battery + " %");
  $("iConn").textContent = wired ? t("wiredMode") : t("wirelessMode");
  $("iGen").textContent = gen ? `v${gen}` : "—";

  const tb = $("cpiRows"); tb.innerHTML = "";
  for (let n = 0; n < 4; n++) {
    const tr = document.createElement("tr");
    const dis = n >= stage.levels ? "disabled" : "";
    tr.innerHTML = `<td>CPI ${n + 1}${n === stage.active ? t("current") : ""}</td><td>${STAGE_COLORS[LANG][n]}</td>
      <td><input type="checkbox" data-xy="${n}" ${stage.cpi[n][0] ? "checked" : ""} ${dis}></td>
      <td><input type="number" data-x="${n}" min="50" max="30000" step="50" value="${stage.cpi[n][1]}" ${dis}></td>
      <td><input type="number" data-y="${n}" min="50" max="30000" step="50" value="${stage.cpi[n][2]}" ${stage.cpi[n][0] && !dis ? "" : "disabled"}></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll("input[data-xy]").forEach(el => el.onchange = () => {
    const n = +el.dataset.xy; stage.cpi[n][0] = el.checked ? 1 : 0;
    tb.querySelector(`input[data-y="${n}"]`).disabled = !el.checked;
  });
  tb.querySelectorAll("input[data-x],input[data-y]").forEach(el => el.onchange = () => {
    const n = +(el.dataset.x ?? el.dataset.y); const ax = el.dataset.x ? 1 : 2;
    stage.cpi[n][ax] = Math.max(10, Math.min(30000, +el.value || 400));
  });
  $("cpiLevels").value = String(stage.levels);
  $("cpiLevels").onchange = e => stage.levels = +e.target.value;
  const actSel = $("cpiActive");
  fillSelect(actSel, [[0,"CPI 1"],[1,"CPI 2"],[2,"CPI 3"],[3,"CPI 4"]], stage.active);
  actSel.disabled = gen === 1;
  $("cpiActiveNote").textContent = gen === 1 ? t("v1StageNote") : "";
  actSel.onchange = e => stage.active = +e.target.value;

  const lodSel = $("lod");
  if (gen === 1 || stage.glass) {
    fillSelect(lodSel, [[1,"1.0 mm"],[2,"2.0 mm"]], Math.round(stage.lodMM));
  } else {
    const opts = []; for (let i = 7; i <= 17; i++) opts.push([i / 10, (i / 10).toFixed(1) + " mm"]);
    fillSelect(lodSel, opts, +stage.lodMM.toFixed(1));
  }
  lodSel.onchange = e => stage.lodMM = +e.target.value;
  $("glass").value = String(stage.glass);
  $("glass").disabled = gen !== 2;
  $("glass").onchange = e => {
    const g = +e.target.value; const old = stage.glass;
    stage.glass = g;
    if (g !== old) {
      if (g === 1) stage.lodMM = stage.lodMM <= 0.8 ? 1 : 2;
      else stage.lodMM = stage.lodMM === 1 ? 1.0 : 1.7;
    }
    render();
  };
  $("angleSnap").value = String(stage.angleSnap); $("angleSnap").onchange = e => stage.angleSnap = +e.target.value;
  $("ripple").value = String(stage.ripple); $("ripple").onchange = e => stage.ripple = +e.target.value;
  $("ledLiftoff").value = String(stage.ledLiftoff); $("ledLiftoff").onchange = e => stage.ledLiftoff = +e.target.value;
  $("angleTune").value = stage.angleTune;
  $("angleTune").disabled = gen !== 2;
  $("angleTune").onchange = e => stage.angleTune = Math.max(-30, Math.min(30, +e.target.value || 0));

  const pollSel = $("polling");
  const isEn = LANG === "en";
  const ps = isEn ? "power saving" : "省电", of = isEn ? "office" : "办公";
  const pollOpts = gen === 1
    ? [[0x02,"4000 Hz"],[0x04,"2000 Hz"],[0x08,"1000 Hz"]]
    : [[0x02,"4000 Hz"],[0x04,"2000 Hz"],[0x08,"1000 Hz"],[0x80,`1000 Hz (${ps})`],[0x40,`125 Hz (${of})`]];
  fillSelect(pollSel, pollOpts, stage.polling);
  if (!(gen === 1 && ![0x02,0x04,0x08].includes(stage.polling))) pollSel.value = String(stage.polling);
  $("pollNote").textContent = wired ? t("pollWiredNote") : "";
  pollSel.onchange = e => stage.polling = +e.target.value;
  $("motionSync").value = String(stage.motionSync); $("motionSync").onchange = e => stage.motionSync = +e.target.value;
  stage.slamclick = !!(stage.flags & 1);
  $("slamclick").value = stage.slamclick ? "1" : "0"; $("slamclick").onchange = e => stage.slamclick = +e.target.value;
  $("rowV1Jitter").style.display = gen === 1 ? "" : "none";
  stage.jitter = !!(stage.flags & 0x10);
  $("jitter").value = stage.jitter ? "1" : "0"; $("jitter").onchange = e => stage.jitter = +e.target.value;
  $("rowV2Max").style.display = gen === 2 ? "" : "none";
  stage.maxFps = !!(stage.flags & 0x40);
  $("maxFps").value = stage.maxFps ? "1" : "0"; $("maxFps").onchange = e => stage.maxFps = +e.target.value;
  $("rowV2Multi").style.display = gen === 2 ? "" : "none";
  stage.multiclick = !!(stage.flags & 0x20);
  $("multiclick").value = stage.multiclick ? "1" : "0"; $("multiclick").onchange = e => stage.multiclick = +e.target.value;
  const toOpts = [["off", t("minutes") === "min" ? "Off" : "关闭"]].concat(Array.from({length:120},(_,i)=>[i+1, t("minutesFmt", i+1)]));
  fillSelect($("powerSaving"), toOpts, stage.powerSaving); $("powerSaving").value = String(stage.powerSaving);
  $("powerSaving").onchange = e => stage.powerSaving = e.target.value === "off" ? "off" : +e.target.value;
  fillSelect($("deepSleep"), toOpts, stage.deepSleep); $("deepSleep").value = String(stage.deepSleep);
  $("deepSleep").onchange = e => stage.deepSleep = e.target.value === "off" ? "off" : +e.target.value;

  const br = $("btnRows"); br.innerHTML = "";
  stage.buttons.forEach((btn, i) => {
    br.insertAdjacentHTML("beforeend", `<tr><td>${BTN_NAMES[LANG][i]}</td><td>${describeMap(btn)}</td><td>${btn.filter === 0xF0 ? t("gxSafe") : btn.filter === 0xF1 ? t("gxSpeed") : (btn.filter & 0x7F)}</td></tr>`);
  });
  const fr = $("filterRows"); fr.innerHTML = "";
  BTN_NAMES[LANG].slice(0, 5).forEach((name, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td><select data-f="${i}"></select></td>`;
    fr.appendChild(tr);
    const sel = tr.querySelector("select");
    const opts = FILTER_OPTS.slice();
    if (i <= 1) opts.push(["0xF0", t("gxSafe")],["0xF1", t("gxSpeed")]);
    fillSelect(sel, opts, stage.filters[i]);
    sel.value = String(stage.filters[i]);
    sel.onchange = e => stage.filters[i] = +(e.target as HTMLSelectElement).value;
  });
}
function describeMap(b) {
  switch (b.type) {
    case 0x00: return { 1:"←",2:"→",4:"⌘",8:"↓",0x10:"↑" }[b.code] || t("mouseBtn", b.code.toString(16));
    case 0x01: return b.code === 1 ? "↑" : "↓";
    case 0x02: return t("keyboardMap", b.code.toString(16), b.key.toString(16));
    case 0x09: return b.code === 0xF1 ? t("cpiCycle") : t("specialFn", b.code.toString(16));
    case 0x0C: return t("fixedCpi");
    case 0x18: return b.code === 0x96 ? "🌐 Browser" : b.code === 0x94 ? "📁 Explorer" : t("typeRaw", "18");
    case 0x20: return t("mediaKey", b.code.toString(16));
    case 0xFF: return t("disabled");
    default: return t("typeRaw", b.type.toString(16));
  }
}

/* ================= 应用流程 ================= */
/* 官方工具的写后 settle：有线 500ms / 无线 880ms（模式字节 0x11/0x22，见 re/PROTOCOL_NOTES.md） */
const writeSettle = () => wired ? 500 : 880;
const resetSettle = () => wired ? 800 : 1080;

async function applySensor() {
  const glassChanged = gen === 2 && (blob[0x6F] ? 1 : 0) !== stage.glass;
  await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
  log("✓ cmd 0x14 written");
  if (glassChanged) {
    await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
    log("✓ glass-mode linked cmd 0x15 written");
  }
  await refreshAll();
  banner("ok", t("bSensor"));
}
async function applyPerf() {
  const glassChanged = gen === 2 && (blob[0x6F] ? 1 : 0) !== stage.glass;
  await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
  log("✓ cmd 0x15 written");
  if (glassChanged) {
    await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
    log("✓ glass-mode linked cmd 0x14 written");
  }
  await refreshAll();
  banner("ok", t("bPerf"));
}
async function refreshAll() {
  banner("warn", "");
  try {
    await probe();
    try { const r = await guarded(0x0D, 0x00, null, { pace: 150 }); dongleFw = fwStr(r[16] | (r[17] << 8)); }
    catch (e) { if (e.code !== 0x07) throw e; dongleFw = "—"; }
    let mouseOk = false;
    try {
      const r = await guarded(0x0E, 0x00, null, { pace: 150 });
      const pid = r[18] | (r[19] << 8);
      if (MOUSE_PIDS[pid]) { mouseName = MOUSE_PIDS[pid][0]; gen = MOUSE_PIDS[pid][1]; }
      else { mouseName = `Unknown (PID 0x${pid.toString(16)})`; gen = null; }
      mouseFw = fwStr(r[22] | (r[23] << 8));
      mouseOk = true;
    } catch (e) { if (![0x08, 0x11].includes(e.code)) throw e; }
    try { const r = await guarded(0xB4, 0x00, null, { pace: 150 }); battery = r[16]; } catch (e) { battery = null; }
    showCards();
    if (mouseOk) { await readBlob(); parseBlob(); render(); banner("ok", t("bReadOk")); }
    else { render(); banner("warn", t("bSleep")); }
  } catch (e) { banner("err", t("bRead") + e.message); log("✗ " + e.message); }
}
function fwStr(v) { const h = v.toString(16).padStart(4, "0"); return `${parseInt(h.slice(0, 2), 16)}.${parseInt(h.slice(2), 16)}`; }
function showCards() { for (const id of ["cardInfo","cardSensor","cardPerf","cardBtns","cardTools"]) $(id).style.display = ""; }

/* ================= 连接 ================= */
async function openDevice(d) {
  dev = d; wired = d.productId !== DONGLE_PID;
  await dev.open();
  dev.addEventListener("inputreport", e => {
    if (e.data.byteLength < 2) return;
    const code = e.data.getUint8(0), v = e.data.getUint8(1);
    if (code === 0xB4) { battery = e.data.getUint8(2); render(); log(`⚡ battery event: ${battery}%`); }
    else if (code === 0xB1) { log(v === 1 ? "⚡ radio link: up" : "⚡ radio link: down (mouse asleep)"); }
  });
  setConn(true, wired ? t("connectedWired") : t("connectedWireless"));
  $("btnRefresh").disabled = false;
  log(`✓ opened ${d.productName} VID=0x${d.vendorId.toString(16)} PID=0x${d.productId.toString(16)}`);
  await refreshAll();
}
$("btnConnect").onclick = async () => {
  log("→ 连接点击: WebHID 可用=" + ("hid" in navigator) + " 安全上下文=" + window.isSecureContext);
  if (!("hid" in navigator)) {
    const why = !window.isSecureContext && location.protocol !== "file:"
      ? (LANG === "zh" ? "当前页面不是安全上下文（须 https:// 或 file://），WebHID 被禁用。" : "Page is not a secure context (https:// or file:// required); WebHID disabled.")
      : t("bNoWebhid");
    banner("err", why); return;
  }
  try {
    /* 两个协议族接口页不同（4k=0xFF01，2020 有线代=0xFF02），必须都试，否则会漏掉 XM2we。
       顺序：4k 精确 → 有线代精确 → VID-only → 全量手选。 */
    const attempts = [
      { vendorId: VID, usagePage: 0xFF01, usage: 0x02 },
      { vendorId: VID, usagePage: 0xFF02, usage: 0x02 },
      { vendorId: VID },
      {},
    ];
    let devs = [];
    for (const f of attempts) {
      devs = await (navigator as any).hid.requestDevice({ filters: [f] });
      if (devs.length) break;
    }
    if (!devs.length) return;
    for (const d of devs) {
      const fam = isXm2weFamily(d.productId, d.collections) ? "XM2we/2020" : "4k";
      const kind = fam === "XM2we/2020"
        ? (d.productId === WE_DONGLE_PID ? "接收器" : "鼠标")
        : (d.productId === DONGLE_PID ? "dongle" : (MOUSE_PIDS[d.productId] ? "鼠标" : "未知设备"));
      log(`candidate: "${d.productName}" PID=0x${d.productId.toString(16)} [${fam} · ${kind}] collections=` +
          (d.collections || []).map(c => `pg0x${c.usagePage.toString(16)}/u0x${c.usage.toString(16)}`).join(","));
    }
    // XM2we 族优先（PID 明确），否则挑 vendor 用法页接口
    const pick = devs.find(d => isXm2weFamily(d.productId, d.collections))
              || devs.find(d => (d.collections || []).some(c => c.usagePage >= 0xFF00))
              || devs[0];
    if (isXm2weFamily(pick.productId, pick.collections)) {
      await openXm2we(pick);
      return;
    }
    if (pick.productId === DONGLE_PID)
      log("ℹ 已选择接收器。若鼠标此刻插着 USB 线，无线链路是断开的——请改选鼠标设备（或拔线后再连）。");
    await openDevice(pick);
  } catch (e) { banner("err", t("bConnectFail") + e.message); log("✗ " + e.message); }
};
$("btnRefresh").onclick = () => isXm2weOpen() ? refreshWe() : refreshAll();
/* 护栏：4k 族的写操作绝不能对 XM2we 族执行（协议族完全不同，会写坏 EEPROM）。
   正常路径下卡片已隐藏，这里再挡一次以防脚本/控制台误调。 */
function guard4k() {
  if (isXm2weOpen()) { banner("err", t("bWrongFamily")); log("✗ blocked: XM2we device connected"); throw new Error("wrong protocol family"); }
}
$("btnApplySensor").onclick = () => { try { guard4k(); } catch { return; } applySensor().catch(e => banner("err", t("errWrite") + e.message)); };
$("btnApplyPerf").onclick = () => { try { guard4k(); } catch { return; } applyPerf().catch(e => banner("err", t("errWrite") + e.message)); };
$("btnPair").onclick = async () => {
  try { guard4k(); } catch { return; }
  if (!confirm(t("cfPair"))) return;
  try { await guarded(0x70, 0x00, null, { pace: 300 }); log("✓ pair cmd sent"); banner("ok", t("bPairSent")); await sleep(2000); await refreshAll(); }
  catch (e) { banner("err", e.message); }
};
/* 0x71 = Pair Default（恢复默认配对，零负载，官方发后等 300ms）
   0x72 = Get Pair Data（读取配对数据，官方等 350ms 后收，负载偏移 16 起 16 字节）
   —— 均来自官方 v1.02 工具逆向，见 re/PROTOCOL_NOTES.md */
$("btnPairDefault").onclick = async () => {
  try { guard4k(); } catch { return; }
  if (!confirm(t("cfPairDefault"))) return;
  try { await guarded(0x71, 0x00, null, { pace: 300 }); log("✓ pair-default cmd sent"); banner("ok", t("bPairDefaultOk")); await sleep(2000); await refreshAll(); }
  catch (e) { banner("err", e.message); }
};
$("btnPairData").onclick = async () => {
  try { guard4k(); } catch { return; }
  try {
    const r = await guarded(0x72, 0x00, null, { pace: 350 });
    const d = r.slice(16, 32);
    log("✓ pair data: " + hex(d, 16));
    banner("ok", t("bPairDataOk") + " " + hex(d, 16));
  } catch (e) { banner("err", e.message); }
};
$("btnReset").onclick = async () => {
  try { guard4k(); } catch { return; }
  if (!confirm(t("cfReset1"))) return;
  if (!confirm(t("cfReset2"))) return;
  try { await guarded(0x13, 0x00, null, { pace: resetSettle() }); log("✓ factory reset done"); await refreshAll(); banner("ok", t("bResetOk")); }
  catch (e) { banner("err", e.message); }
};
$("btnSave").onclick = () => {
  if (!blob) return banner("err", t("cfgNoRead"));
  const out = { app: "endgame-gear-web-configurator", savedAt: new Date().toISOString(), device: mouseName, gen, lang: LANG, blobB64: btoa(String.fromCharCode(...blob)) };
  download(JSON.stringify(out, null, 2), `egg-mouse-config-${Date.now()}.json`, "application/json");
};
$("btnBlob").onclick = () => { if (blob) download(new Blob([blob]), `egg-mouse-blob-${Date.now()}.bin`); };
$("btnLoad").onclick = () => $("fileLoad").click();
$("fileLoad").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const b = Uint8Array.from(atob(j.blobB64), c => c.charCodeAt(0));
    if (b.length !== 1024) throw new Error("blob length != 1024");
    blob = b; parseBlob();
    stage.slamclick = !!(stage.flags & 1);
    stage.jitter = !!(stage.flags & 0x10);
    stage.multiclick = !!(stage.flags & 0x20);
    stage.maxFps = !!(stage.flags & 0x40);
    await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
    await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
    for (let chunk = 1; chunk <= 2; chunk++) {
      const p = new Uint8Array(28);
      for (let i = 0; i < 4; i++) {
        const btn = stage.buttons[(chunk - 1) * 4 + i];
        p[i*7] = btn.type; p[i*7+1] = btn.code; p[i*7+2] = btn.key; p[i*7+6] = btn.filter;
      }
      await guarded(0x16, 0x0F, p, { chunk, pace: writeSettle() });
    }
    log("✓ config restored (0x14 + 0x15 + 0x16×2)");
    await refreshAll();
    banner("ok", t("bImportOk"));
  } catch (err) { banner("err", t("bImportFail") + err.message); }
  e.target.value = "";
};
function download(data: any, name: string, type = "application/octet-stream") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
$("btnLog").onclick = () => { const l = $("log"); l.style.display = l.style.display === "none" ? "block" : "none"; };
bindXm2weUI(download);
applyI18n();
log("ℹ ready. Click 'Connect' and pick the Endgame Gear mouse / dongle.");
if (!("hid" in navigator))
  banner("warn", LANG === "zh"
    ? "此环境没有 WebHID：内置预览/iframe/Firefox 都不支持。请把这个 index.html 下载到本地，用 Chrome 或 Edge 直接打开。"
    : "No WebHID here: embedded previews/iframes/Firefox are not supported. Download index.html and open it directly in Chrome or Edge.");
else
  log("✓ WebHID available (" + navigator.userAgent.match(/(Edg|Chrome)\/[\d.]+/)?.[0] + ")");