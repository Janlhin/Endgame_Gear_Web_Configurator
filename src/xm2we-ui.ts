// XM2we（2020 有线/2.4G 代）UI 控制器
/* 与 4k 族完全隔离：本文件只认 Xm2weSession，不触碰 blob / 0xA1 命令表。
 * 协议依据：okms/xm2we-linux PROTOCOL.md（真机验证），存档于 re/upstream/。 */
import { $, sleep, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { applyLayout } from "./layout.js";
import { resetToInitial, watchDisconnect, watchPresence } from "./presence.js";
import type { LostReason } from "./presence.js";
import { Xm2weSession, WE_MOUSE_PID, POLLING_BY_MASK } from "./xm2we.js";

const WE_POLL_OPTS = [125, 250, 500, 1000];

let sess: Xm2weSession | null = null;
let dev = null;                 // 打开的 HIDDevice
let model = "XM2we", wired = true;
let reading = false;

/* 卡片可见性统一交给 layout.ts：XM2we 走 "we" 布局（只显示它那四张卡片），
   关闭时回到 "none"（全部收起）。这样两族的显示规则只有一个来源。 */
function setConn(on: boolean, text: string) {
  const p = $("connState");
  p.className = "status-pill" + (on ? "" : " off");
  p.textContent = text;
}

/** 安全闸门：只拒绝鼠标指针 / 键盘集合；其余系统集合允许
 *  （厂商接口可能同时暴露消费者控制等集合，误拒会导致连不上）。
 *  详见 main.ts isSafeToOpen 的注释（事故背景）。 */
function isSafeToOpen(d): { ok: boolean; why?: string } {
  const cols = d.collections || [];
  if (!cols.length) return { ok: false, why: t("bNoCollections") };
  if (cols.some(c => c.usagePage === 0x0001 && c.usage === 0x0002))
    return { ok: false, why: t("bRefusePointer") };
  if (cols.some(c => c.usagePage === 0x0001 && c.usage === 0x0006))
    return { ok: false, why: t("bRefuseKeyboard") };
  if (!cols.some(c => c.usagePage >= 0xFF00)) return { ok: false, why: t("bNotVendor") };
  return { ok: true };
}

/** 保险丝：open() 后复验，判定为系统集合则立即 close()。
 *  与 main.ts 的 openGuarded 同理——防止将来任何 filter 改动导致误开鼠标指针接口。 */
async function openGuarded(d: any): Promise<boolean> {
  const guard = isSafeToOpen(d);
  if (!guard.ok) {
    log("✗ 拒绝打开：" + guard.why);
    banner("err", guard.why);
    return false;
  }
  await d.open();
  const after = isSafeToOpen(d);
  if (!after.ok) {
    log("✗ 打开后发现是系统集合，立即关闭：" + after.why);
    try { await d.close(); } catch (_) {}
    banner("err", after.why);
    return false;
  }
  return true;
}

/** 打开设备并进入 XM2we 模式。会关闭既有会话，避免两族混用同一 device。 */
export async function openXm2we(d: any) {
  await closeXm2we();
  dev = d;
  wired = d.productId === WE_MOUSE_PID;
  model = wired ? "XM2we (wired)" : "XM2we (2.4G dongle)";
  if (!(await openGuarded(d))) { dev = null; return; }
  sess = new Xm2weSession(d);
  /* 拔线/断电时浏览器在该设备上触发 disconnect —— 走统一的复位路径 */
  watchDisconnect(d, reason => { void onWeLost(reason); });

  // 0x03/0x04 由接收器缓存，即使鼠标睡了也能答；先电量后链路（插线瞬间链路会短暂断开）
  const bat = await sess.readBattery();
  await sess.readLink();

  applyLayout("we");
  setConn(true, wired ? t("connectedWired") : t("connectedWireless"));
  log(`✓ opened ${d.productName} VID=0x${d.vendorId.toString(16)} PID=0x${d.productId.toString(16)} [XM2we]`);
  log(`  usage pages: ` + (d.collections || []).map((c: any) => `pg0x${c.usagePage.toString(16)}/u0x${c.usage.toString(16)}`).join(","));
  if (bat) log(`⚡ battery ${bat.pct}%${bat.charging ? " (charging)" : ""}`);
  renderInfo();
  $("btnRefresh").disabled = false;
  await refreshWe();
}

export async function closeXm2we() {
  sess?.dispose();
  sess = null;
  if (dev) {
    try { if (dev.opened) await dev.close(); } catch (_) {}
    dev = null;
  }
  applyLayout("none");   // 断开后收起全部设备卡片
}

/** XM2we 侧的设备丢失：先拆掉会话（它持有 EEPROM 缓存与轮询定时器），
 *  再走统一的复位路径回到初始界面。 */
async function onWeLost(reason: LostReason) {
  await closeXm2we();
  resetToInitial(reason, model);
}

/* 清点用的「设备位」——4k / XM1 / 8k 那条在 connect.ts 里登记。
   只有一条会真正存在设备，另一条自然一直为空。 */
watchPresence("we", () => dev, reason => { void onWeLost(reason); });

/* 页面切走/关闭时释放接口——WebHID 独占不释放会造成系统侧设备异常。
 * 与 main.ts 的 releaseAllDevices() 是同一道保险，两处都注册不冲突。 */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { closeXm2we(); });
}

function renderInfo() {
  if (!sess) return;
  $("weModel").textContent = model;
  $("weConn").textContent = wired ? t("wiredMode") : t("wirelessMode");
  const b = sess.battery;
  $("weBattery").textContent = b ? (b.charging ? t("charging", b.pct) : b.pct + "%") : "—";
  const l = sess.linkUp;
  $("weLink").textContent = l === null ? t("weLinkUnknown") : l ? t("weLinkUp") : t("weLinkDown");
}

/* ---------- 渲染 ---------- */
function renderCpi() {
  const s = sess; if (!s) return;
  const tb = $("weCpiRows"); tb.innerHTML = "";
  const table = s.cpiTable();
  const leds = s.ledColors();
  if (!table.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">${t("weNoDevice")}</td>`;
    tb.appendChild(tr);
  }
  for (const r of table) {
    const tr = document.createElement("tr");
    const led = leds.find(l => l.slot === r.slot);
    const swatch = led
      ? `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle;border:1px solid #ccc;background:rgb(${led.rgb.join(",")})"></span>`
      : `<span class="muted">—</span>`;
    tr.innerHTML =
      `<td>${t("weSlot")} ${r.slot}${r.slot === 1 ? `<b>${t("weSlot1Tag")}</b>` : ""}</td>` +
      `<td><input type="number" id="weCx${r.slot}" min="50" max="19000" step="50" value="${r.x}" style="width:84px"></td>` +
      `<td><input type="number" id="weCy${r.slot}" min="50" max="19000" step="50" value="${r.y}" style="width:84px"></td>` +
      `<td>${swatch}</td>` +
      `<td class="muted">${r.ok ? "✓" : `<span style="color:var(--err)">${t("weBadRecord")}</span>`}</td>`;
    tb.appendChild(tr);
  }

  const pol = $("wePolling");
  pol.innerHTML = "";
  for (const hz of WE_POLL_OPTS) {
    const o = document.createElement("option");
    o.value = String(hz); o.textContent = hz + " Hz";
    pol.appendChild(o);
  }
  const cur = s.polling();
  pol.value = cur !== null && POLLING_BY_MASK[0] !== undefined ? String(cur) : "";
  if (cur === null) { const o = document.createElement("option"); o.value = ""; o.textContent = "—"; pol.prepend(o); }

  const db = $("weDebounce");
  const d = s.debounce();
  if (document.activeElement !== db) db.value = d === null ? "" : String(d);
}

function renderKeys() {
  const s = sess; if (!s) return;
  const tb = $("weBtnRows"); tb.innerHTML = "";
  for (const r of s.keyTable()) {
    const tr = document.createElement("tr");
    const [typ, code, param] = r.raw;
    tr.innerHTML =
      `<td>${t("weSlot")} ${r.slot}</td>` +
      `<td>${r.label}</td>` +
      `<td class="muted">0x${typ.toString(16).padStart(2, "0")} / 0x${code.toString(16).padStart(2, "0")} / 0x${param.toString(16).padStart(2, "0")}</td>` +
      `<td class="muted">${r.ok ? "✓" : `<span style="color:var(--err)">${t("weBadRecord")}</span>`}</td>`;
    tb.appendChild(tr);
  }
}

/* ---------- 读 / 写 ---------- */
export async function refreshWe() {
  if (!sess) return;
  if (reading) return;
  reading = true;
  $("btnRefresh").disabled = true;
  try {
    log(`→ EEPROM read (0x${(0xB4 + 1).toString(16)} bytes, ~${Math.ceil(0xB5 / 10)} frames)`);
    await sess.readConfig((done, total) => {
      const b = $("banner");
      if (done < total) { b.className = "banner warn"; b.textContent = t("weReadProgress", done, total); }
    });
    await sess.readBattery();
    await sess.readLink();
    renderInfo(); renderCpi(); renderKeys();
    banner("ok", t("weReadOk"));
    log(`✓ EEPROM read OK — polling=${sess.polling() ?? "?"} debounce=${sess.debounce() ?? "?"} cpi=${sess.cpiTable().map(c => c.x).join("/")}`);
    for (const r of sess.cpiTable()) if (!r.ok) log(`⚠ CPI slot ${r.slot} checksum mismatch`);
    for (const r of sess.keyTable()) if (!r.ok) log(`⚠ key slot ${r.slot} checksum mismatch`);
  } catch (e: any) {
    const asleep = /asleep|timed out|超时/i.test(e.message);
    banner("err", (asleep ? t("weWakeHint") + " " : "") + e.message);
    log("✗ " + e.message);
  } finally {
    reading = false;
    $("btnRefresh").disabled = false;
  }
}

/** 应用 CPI + LED 颜色（每槽一条 4 字节记录，逐条回读验证） */
async function applyCpi() {
  if (!sess) return banner("err", t("weNoDevice"));
  try {
    const slots = sess.cpiTable();
    if (!slots.length) throw new Error(t("weNoDevice"));
    const leds = sess.ledColors();
    let n = 0;
    for (const r of slots) {
      const ix = $("weCx" + r.slot), iy = $("weCy" + r.slot);
      const x = parseInt(ix?.value ?? "", 10), y = parseInt(iy?.value ?? "", 10);
      if (!isFinite(x) || !isFinite(y)) continue;
      if (x !== r.x || y !== r.y) { await sess.writeCpiSlot(r.slot, x, y); log(`✓ CPI slot ${r.slot} → ${x}x${y}`); n++; await sleep(120); }
      else {
        // LED 颜色在页面上只展示不编辑，这里保持原样不动
        void leds;
      }
    }
    log(n ? `✓ ${n} CPI record(s) written` : "✓ CPI unchanged");
    banner("ok", t("weApplyOk"));
    await refreshWe();
  } catch (e: any) { banner("err", e.message); log("✗ " + e.message); }
}

/** 应用回报率 + 去抖（成对标量：值 + 0x55 补码） */
async function applyPerf() {
  if (!sess) return banner("err", t("weNoDevice"));
  try {
    const hz = parseInt($("wePolling").value, 10);
    if (isFinite(hz) && hz > 0) {
      await sess.writePolling(hz);
      log(`✓ polling rate → ${hz} Hz (mask 0x${(1000 / hz).toString(16)})`);
    }
    const dbEl = $("weDebounce");
    if (document.activeElement !== dbEl) {
      const db = parseInt(dbEl.value, 10);
      if (isFinite(db) && db >= 0) { await sess.writeDebounce(db); log(`✓ debounce → ${db} ms`); }
    }
    banner("ok", t("weApplyOk"));
    await refreshWe();
  } catch (e: any) { banner("err", e.message); log("✗ " + e.message); }
}

/* ---------- 事件绑定（启动时调用一次） ---------- */
export function bindXm2weUI(download: (data: any, name: string, type?: string) => void) {
  $("btnWeApplyCpi").onclick = () => applyCpi();
  $("btnWeApplyPerf").onclick = () => applyPerf();
  $("btnWeExport").onclick = () => {
    if (!sess?.mem.size) return banner("err", t("weNoDevice"));
    const head = `# XM2we EEPROM dump — ${model} — ${new Date().toISOString()}\n` +
                 `# 0x55-complement records; a valid checksum proves record boundaries only.\n`;
    download(head + sess.dumpHex(), `xm2we-eeprom-${Date.now()}.txt`, "text/plain");
  };
  $("btnWeExportJson").onclick = () => {
    if (!sess?.mem.size) return banner("err", t("weNoDevice"));
    download(JSON.stringify(sess.toJSON(), null, 2), `xm2we-config-${Date.now()}.json`, "application/json");
  };
  $("btnWeLog").onclick = () => {
    const l = $("log");
    l.style.display = l.style.display === "none" ? "block" : "none";
  };
  document.addEventListener("langchange", () => { renderInfo(); renderCpi(); renderKeys(); });
}

export function isXm2weOpen() { return !!sess; }
