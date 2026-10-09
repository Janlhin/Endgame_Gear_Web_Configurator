/** 界面渲染：把 S 里的状态写成 DOM。
 *
 *  事件绑定就地写在渲染函数里（控件是渲染时动态建出来的，每次渲染后重绑），
 *  所以本模块引用 device-xm1 的 xm1Apply。依赖方向是 render → device，单向。
 */
import { $, banner } from "./util.js";
import { LANG, t } from "./i18n.js";
import { S } from "./state.js";
import { xm1Apply } from "./device-xm1.js";
import { cpiClamp, cpiInputBounds } from "./blob.js";
// XM1_MAX_STAGES 原先在这里导入但从未使用（XM1 档位数量在 blob.ts 解析时
// 就已写进 stage.levels）——2026-10-09 随本次死代码清理一并移除。

/* ★ 这两张表按 LANG 直接取用（取不到就是 undefined → 崩）。
   新增语言时必须同步补齐 —— re/i18n_audit.mjs 会校验它们覆盖了全部语言。 */
export const STAGE_COLORS: Record<string, string[]> = {
  "zh-CN": ["蓝", "绿", "黄", "红"], "zh-TW": ["藍", "綠", "黃", "紅"],
  "en": ["Blue", "Green", "Yellow", "Red"], "de": ["Blau", "Grün", "Gelb", "Rot"],
  "fr": ["Bleu", "Vert", "Jaune", "Rouge"], "es": ["Azul", "Verde", "Amarillo", "Rojo"],
  "ja": ["青", "緑", "黄", "赤"], "ko": ["파랑", "초록", "노랑", "빨강"],
};
export const BTN_NAMES: Record<string, string[]> = {
  "zh-CN": ["左键", "右键", "中键", "后退", "前进", "特殊(CPI)", "滚轮上", "滚轮下"],
  "zh-TW": ["左鍵", "右鍵", "中鍵", "後退", "前進", "特殊(CPI)", "滾輪上", "滾輪下"],
  "en": ["Left", "Right", "Middle", "Back", "Forward", "Special (CPI)", "Wheel up", "Wheel down"],
  "de": ["Links", "Rechts", "Mitte", "Zurück", "Vor", "Spezial (CPI)", "Rad auf", "Rad ab"],
  "fr": ["Gauche", "Droite", "Milieu", "Retour", "Avant", "Spécial (CPI)", "Molette haut", "Molette bas"],
  "es": ["Izquierdo", "Derecho", "Central", "Atrás", "Adelante", "Especial (CPI)", "Rueda arriba", "Rueda abajo"],
  "ja": ["左", "右", "中", "戻る", "進む", "特殊(CPI)", "ホイール上", "ホイール下"],
  "ko": ["왼쪽", "오른쪽", "가운데", "뒤로", "앞으로", "특수(CPI)", "휠 위", "휠 아래"],
};
export const FILTER_OPTS = [["off","off"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["11","11"],["12","12"],["13","13"],["14","14"],["15","15"]];

export function setConn(on: boolean, text: string) { const p = $("connState"); p.className = "status-pill" + (on ? "" : " off"); p.textContent = text; }

export function fillSelect(sel: HTMLSelectElement, opts: (string | number)[][], val: string | number) {
  sel.innerHTML = "";
  for (const [v, tt] of opts) {
    const o = document.createElement("option"); o.value = String(v); o.textContent = String(tt); sel.appendChild(o);
  }
  sel.value = String(val);
}

export function renderXm1() {
  $("iModel").textContent = S.mouseName;
  $("iMouseFw").textContent = "—";
  $("iDongleFw").textContent = t("noDongleWired");
  $("iBattery").textContent = "—";
  $("iConn").textContent = t("wiredMode");
  $("iGen").textContent = "2020 (XM1)";

  // 表头由 layout.ts 的 applyLayout("xm1") 设置（XM1 是单值 CPI，固件只读 X）

  const tb = $("cpiRows");
  tb.innerHTML = "";
  if (!S.blob || !S.blob.length || !S.xm1Edit) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">${t("bRead")}</td>`;
    tb.appendChild(tr);
    return;
  }

  S.xm1Edit.stages.forEach((st: any, i: number) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>CPI ${i + 1}</td>` +
      `<td><input type="checkbox" data-on="${i}"${st.on ? " checked" : ""}></td>` +
      `<td style="text-align:center"><input type="radio" name="xm1act" data-act="${i}"${S.xm1Edit.active === i ? " checked" : ""}></td>` +
      `<td colspan="2"><input type="number" data-x="${i}" min="50" max="30000" step="50" value="${st.x}"></td>`;
    // XM1 恒走默认档（50–30000/步进 50）：它的步进是 2026-10-08 实测确认过的，不随 gen 放宽
    tb.appendChild(tr);
  });
  // 事件：直接改编辑状态，不立即写设备
  tb.querySelectorAll("input[data-on]").forEach((el: HTMLInputElement) => {
    el.onchange = () => { S.xm1Edit.stages[+el.dataset.on!].on = el.checked ? 1 : 0; };
  });
  tb.querySelectorAll("input[data-act]").forEach((el: HTMLInputElement) => {
    el.onchange = () => { S.xm1Edit.active = +el.dataset.act!; };
  });
  tb.querySelectorAll("input[data-x]").forEach((el: HTMLInputElement) => {
    el.oninput = () => { S.xm1Edit.stages[+el.dataset.x!].x = +el.value || 0; };
  });
  const note = document.createElement("tr");
  note.innerHTML = `<td colspan="5" class="muted">${t("xm1EditNote")}</td>`;
  tb.appendChild(note);

  // LOD / Ripple：XM1 只有这两个传感器项已核实
  const lodSel = $("lod");
  if (lodSel) {
    fillSelect(lodSel, [[1, "1 mm"], [2, "2 mm"], [3, "3 mm"]], Math.round(S.xm1Edit.lodMM));
    lodSel.disabled = false;
    lodSel.onchange = () => { S.xm1Edit.lodMM = +lodSel.value; };
  }
  const rip = $("ripple");
  if (rip) {
    rip.checked = !!S.xm1Edit.ripple;
    rip.disabled = false;
    rip.onchange = () => { S.xm1Edit.ripple = rip.checked ? 1 : 0; };
  }
  // 档位数：XM1 固定 4 档（官方 UI 也是 4 张卡片），只读展示
  const lv = $("cpiLevels");
  if (lv) { lv.value = "4"; lv.disabled = true; }
  const act = $("cpiActive");
  if (act) { act.disabled = true; }        // 激活档用表内单选，避免两处入口
  const note2 = $("cpiActiveNote");
  if (note2) note2.textContent = "";

  // 其余控件（4k 族专属）保持禁用
  for (const id of ["btnApplyPerf", "glass", "angleSnap", "ledLiftoff", "angleTune",
                    "polling", "motionSync", "slamclick", "jitter", "maxFps", "multiclick",
                    "powerSaving", "deepSleep", "btnReset", "btnLoad"]) {
    const el = $(id); if (el) el.disabled = true;
  }
  const apply = $("btnApplySensor");
  if (apply) { apply.disabled = !S.xm1LastRead; apply.onclick = () => { void xm1Apply(); }; }
  const save = $("btnSave"); if (save) save.disabled = false;
  const echoBtn = $("btnXm1Echo");
  if (echoBtn) { echoBtn.style.display = ""; echoBtn.disabled = !S.xm1LastRead; }
  const undo = $("btnXm1Undo");
  if (undo) {
    undo.style.display = "";
    undo.disabled = S.xm1Snaps.length < 2;
    undo.textContent = t("xm1Undo") + " (" + S.xm1Snaps.length + ")";
  }
}

export function renderInfoOnly() {
  $("iModel").textContent = S.mouseName;
  $("iMouseFw").textContent = "—";
  $("iDongleFw").textContent = "—";
  $("iBattery").textContent = "—";
  $("iConn").textContent = t("wiredMode");
  $("iGen").textContent = t("family4Name");
}

export function render() {
  /* XM1：字段已实测确认，走 renderXm1() 的受限编辑器（写入只涉及 23 个已核实字节）。 */
  if (S.xm1) return renderXm1();

  $("iModel").textContent = S.mouseName;
  $("iMouseFw").textContent = S.mouseFw;
  $("iDongleFw").textContent = S.wired ? t("noDongleWired") : S.dongleFw;
  $("iBattery").textContent = S.battery === null ? "—"
    : (S.wired && S.battery < 100 ? t("charging", S.battery) : S.battery + " %");
  $("iConn").textContent = S.wired ? t("wiredMode") : t("wirelessMode");
  $("iGen").textContent = S.eightK ? t("gen8k") : (S.gen ? `v${S.gen}` : "—");

  const tb = $("cpiRows"); tb.innerHTML = "";
  for (let n = 0; n < 4; n++) {
    const tr = document.createElement("tr");
    const dis = n >= S.stage.levels ? "disabled" : "";
    /* XY 开关关闭 = 官方软件的单值语义：Y 显示为与 X 相同（框禁用但跟随） */
    const xyOn = S.stage.cpi[n][0] ? 1 : 0;
    const xv = S.stage.cpi[n][1], yv = xyOn ? S.stage.cpi[n][2] : S.stage.cpi[n][1];
    const bd = cpiInputBounds(S.gen);
    tr.innerHTML = `<td>CPI ${n + 1}${n === S.stage.active ? t("current") : ""}</td><td>${STAGE_COLORS[LANG]?.[n] ?? ""}</td>
      <td><input type="checkbox" data-xy="${n}" ${xyOn ? "checked" : ""} ${dis}></td>
      <td><input type="number" data-x="${n}" min="${bd.min}" max="${bd.max}" step="${bd.step}" value="${xv}" ${dis}></td>
      <td><input type="number" data-y="${n}" min="${bd.min}" max="${bd.max}" step="${bd.step}" value="${yv}" ${xyOn && !dis ? "" : "disabled"}></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll("input[data-xy]").forEach((el: HTMLInputElement) => el.onchange = () => {
    const n = +el.dataset.xy!; S.stage.cpi[n][0] = el.checked ? 1 : 0;
    const yEl: any = tb.querySelector(`input[data-y="${n}"]`);
    yEl.disabled = !el.checked;
    /* 取消独立 → 立刻回到单值语义：Y 同步为 X，
       不留下"开关关着、两个值却不同"的中间状态。 */
    if (!el.checked) { S.stage.cpi[n][2] = S.stage.cpi[n][1]; yEl.value = String(S.stage.cpi[n][1]); }
  });
  tb.querySelectorAll("input[data-x],input[data-y]").forEach((el: HTMLInputElement) => el.onchange = () => {
    const n = +((el.dataset.x ?? el.dataset.y)!); const ax = el.dataset.x ? 1 : 2;
    /* ★ CPI 归一化走 blob.ts 的单一来源（默认 50–30000/步进 50；
        gen=2 的 paw3950 族放宽到 10–30000、≤10000 步进 10）。 */
    const raw = +el.value || 400;
    const v = cpiClamp(raw, S.gen);
    (el as any).value = String(v);
    const note = $("cpiStepNote");
    if (note) note.textContent = v !== raw ? t("cpiAligned", String(v)) : "";
    S.stage.cpi[n][ax] = v;
    /* ★ 未启用 XY 独立时两个值联动 —— 等同官方软件的单一 CPI 输入 */
    if (!S.stage.cpi[n][0]) {
      S.stage.cpi[n][1] = S.stage.cpi[n][2] = v;
      const xEl: any = tb.querySelector(`input[data-x="${n}"]`);
      const yEl: any = tb.querySelector(`input[data-y="${n}"]`);
      if (xEl) xEl.value = String(v);
      if (yEl) yEl.value = String(v);
    }
  });
  /* 开关含义提示：不勾 = 官方那套单值 CPI，勾上才独立 */
  const hint = document.createElement("tr");
  hint.innerHTML = `<td colspan="5" class="muted">${t("xyHint")}</td>`;
  tb.appendChild(hint);

  $("cpiLevels").value = String(S.stage.levels);
  $("cpiLevels").onchange = (e: Event) => S.stage.levels = +(e.target as HTMLSelectElement).value;
  const actSel = $("cpiActive");
  fillSelect(actSel, [[0,"CPI 1"],[1,"CPI 2"],[2,"CPI 3"],[3,"CPI 4"]], S.stage.active);
  actSel.disabled = S.gen === 1;
  $("cpiActiveNote").textContent = S.gen === 1 ? t("v1StageNote") : "";
  actSel.onchange = (e: Event) => S.stage.active = +(e.target as HTMLSelectElement).value;

  const lodSel = $("lod");
  if (S.gen === 1 || S.stage.glass) {
    fillSelect(lodSel, [[1,"1.0 mm"],[2,"2.0 mm"]], Math.round(S.stage.lodMM));
  } else {
    const opts: [number, string][] = [];
    for (let i = 7; i <= 17; i++) opts.push([i / 10, (i / 10).toFixed(1) + " mm"]);
    fillSelect(lodSel, opts, +S.stage.lodMM.toFixed(1));
  }
  lodSel.onchange = (e: Event) => S.stage.lodMM = +(e.target as HTMLSelectElement).value;
  $("glass").value = String(S.stage.glass);
  $("glass").disabled = S.gen !== 2;
  $("glass").onchange = (e: Event) => {
    const g = +(e.target as HTMLSelectElement).value; const old = S.stage.glass;
    S.stage.glass = g;
    if (g !== old) {
      if (g === 1) S.stage.lodMM = S.stage.lodMM <= 0.8 ? 1 : 2;
      else S.stage.lodMM = S.stage.lodMM === 1 ? 1.0 : 1.7;
    }
    render();
  };
  $("angleSnap").value = String(S.stage.angleSnap); $("angleSnap").onchange = (e: Event) => S.stage.angleSnap = +(e.target as HTMLSelectElement).value;
  $("ripple").value = String(S.stage.ripple); $("ripple").onchange = (e: Event) => S.stage.ripple = +(e.target as HTMLSelectElement).value;
  $("ledLiftoff").value = String(S.stage.ledLiftoff); $("ledLiftoff").onchange = (e: Event) => S.stage.ledLiftoff = +(e.target as HTMLSelectElement).value;
  /* ★ 角度调校**只读**：v2 专属字段的位置存在两说（4k 分块写的 payload[5] ↔
     blob[0x01] 与 8k 交叉印证的 blob[0x70]）。读写若指向不同字节，就是"读 A 写 B"——
     设备拿到的是我们从未展示过的值。真机改值回读定论前，这里不开放编辑。 */
  $("angleTune").value = S.stage.angleTune;
  $("angleTune").disabled = true;
  $("angleTune").title = t("angleTuneNote");

  const pollSel = $("polling");
  const isEn = LANG === "en";
  const ps = isEn ? "power saving" : "省电", of = isEn ? "office" : "办公";
  /* 8k 有线：divider 1/2/4/8 → 8000/4000/2000/1000 Hz（egctl 与官方工具一致）。
     4k 无线则没有 8000 档，且 1000 Hz 有省电/办公两个特殊编码。 */
  const pollOpts = S.eightK
    ? [[0x01,"8000 Hz"],[0x02,"4000 Hz"],[0x04,"2000 Hz"],[0x08,"1000 Hz"]]
    : S.gen === 1
      ? [[0x02,"4000 Hz"],[0x04,"2000 Hz"],[0x08,"1000 Hz"]]
      : [[0x02,"4000 Hz"],[0x04,"2000 Hz"],[0x08,"1000 Hz"],[0x80,`1000 Hz (${ps})`],[0x40,`125 Hz (${of})`]];
  fillSelect(pollSel, pollOpts, S.stage.polling);
  if (S.eightK || !(S.gen === 1 && ![0x02,0x04,0x08].includes(S.stage.polling))) pollSel.value = String(S.stage.polling);
  $("pollNote").textContent = S.wired ? t("pollWiredNote") : "";
  pollSel.onchange = (e: Event) => S.stage.polling = +(e.target as HTMLSelectElement).value;
  $("motionSync").value = String(S.stage.motionSync); $("motionSync").onchange = (e: Event) => S.stage.motionSync = +(e.target as HTMLSelectElement).value;
  S.stage.slamclick = !!(S.stage.flags & 1);
  $("slamclick").value = S.stage.slamclick ? "1" : "0"; $("slamclick").onchange = (e: Event) => S.stage.slamclick = +(e.target as HTMLSelectElement).value;
  /* 注意：行级显示（rowV1Jitter / rowV2Max / rowV2Multi 等）**统一由 layout.ts 负责**，
     这里不再设置 display —— 两处各自切换会互相打架（8k 就同时踩到这一点）。 */
  S.stage.jitter = !!(S.stage.flags & 0x10);
  $("jitter").value = S.stage.jitter ? "1" : "0"; $("jitter").onchange = (e: Event) => S.stage.jitter = +(e.target as HTMLSelectElement).value;
  S.stage.maxFps = !!(S.stage.flags & 0x40);
  $("maxFps").value = S.stage.maxFps ? "1" : "0"; $("maxFps").onchange = (e: Event) => S.stage.maxFps = +(e.target as HTMLSelectElement).value;
  S.stage.multiclick = !!(S.stage.flags & 0x20);
  $("multiclick").value = S.stage.multiclick ? "1" : "0"; $("multiclick").onchange = (e: Event) => S.stage.multiclick = +(e.target as HTMLSelectElement).value;
  const toOpts: [string | number, string][] = [["off", t("minutes") === "min" ? "Off" : "关闭"]];
  for (let i = 1; i <= 120; i++) toOpts.push([i, t("minutesFmt", i)]);;
  fillSelect($("powerSaving"), toOpts, S.stage.powerSaving); $("powerSaving").value = String(S.stage.powerSaving);
  $("powerSaving").onchange = (e: Event) => S.stage.powerSaving = (e.target as HTMLSelectElement).value === "off" ? "off" : +(e.target as HTMLSelectElement).value;
  fillSelect($("deepSleep"), toOpts, S.stage.deepSleep); $("deepSleep").value = String(S.stage.deepSleep);
  $("deepSleep").onchange = (e: Event) => S.stage.deepSleep = (e.target as HTMLSelectElement).value === "off" ? "off" : +(e.target as HTMLSelectElement).value;

  const br = $("btnRows"); br.innerHTML = "";
  S.stage.buttons.forEach((btn: any, i: number) => {
    br.insertAdjacentHTML("beforeend", `<tr><td>${BTN_NAMES[LANG]?.[i] ?? i + 1}</td><td>${describeMap(btn)}</td><td>${btn.filter === 0xF0 ? t("gxSafe") : btn.filter === 0xF1 ? t("gxSpeed") : (btn.filter & 0x7F)}</td></tr>`);
  });
  const fr = $("filterRows"); fr.innerHTML = "";
  (BTN_NAMES[LANG] ?? []).slice(0, 5).forEach((name: string, i: number) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td><select data-f="${i}"></select></td>`;
    fr.appendChild(tr);
    const sel = tr.querySelector("select");
    const opts = FILTER_OPTS.slice();
    if (i <= 1) opts.push(["0xF0", t("gxSafe")],["0xF1", t("gxSpeed")]);
    if (!sel) return;
    fillSelect(sel, opts, S.stage.filters[i]);
    sel.value = String(S.stage.filters[i]);
    sel.onchange = (e: Event) => S.stage.filters[i] = +(e.target as HTMLSelectElement).value;
  });

  /* 「没读到配置就不给写」的界面侧体现：按钮直接禁用，而不是等用户点了才弹错。
     8k 例外：它的 gen 恒为 null，但**允许点** —— 点了会弹"未验证型号"确认框（guard4k），
     确认后才放行。这是远程志愿者唯一能帮我们验证 8k 写入的入口，不能置灰堵死。 */
  const canWrite = !!S.blob && !S.unverified && (S.eightK || !!S.gen);
  for (const id of ["btnApplySensor", "btnApplyPerf", "btnReset"]) {
    const el = $(id); if (el) el.disabled = !canWrite;
  }
  /* 导入与配对对 8k 一律关掉，与确认无关：
     · 导入 = 整块覆盖，导入别型号的 blob 等于把未知偏移全改写（XM1 事故的形态）；
     · 配对 = 无线专属命令，对有线 8k 没有意义，行为未知。 */
  for (const id of ["btnLoad", "btnPair", "btnPairDefault"]) {
    const el = $(id); if (el) el.disabled = !canWrite || !!S.eightK;
  }

  /* 未真机验证的型号：禁用全部写入入口（guard4k 还会再兜一层）。
     读取、导出照常可用 —— 只读本身是有价值的，写入必须等硬件确认。 */
  if (S.unverified) {
    for (const id of ["btnApplySensor", "btnApplyPerf", "btnReset", "btnLoad",
                      "cpiLevels", "cpiActive", "lod", "glass", "angleSnap", "ripple",
                      "ledLiftoff", "angleTune"]) {
      const el = $(id); if (el) el.disabled = true;
    }
    /* 表内的 CPI 输入框也要禁掉 —— 否则用户能改数字却点不动"应用"，
       像是页面坏了，而不是"这个型号暂不支持写入"。 */
    document.querySelectorAll("#cpiRows input").forEach((el: any) => { el.disabled = true; });
  }
}

export function describeMap(b: any) {
  switch (b.type) {
    case 0x00: return ({ 1:"←",2:"→",4:"⌘",8:"↓",0x10:"↑" } as Record<number,string>)[b.code] || t("mouseBtn", b.code.toString(16));
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

/* ================= 预设与设置说明 =================
 *
 * ★ 预设只把值填进表单，**绝不写设备** —— 和官方"点一下直接生效"不同，
 *   用户改完还要再点「应用」。这是刻意的：本项目出过一次误写事故（见 TODO.md 不做项）。
 *
 * ★ renderHelp() 只在初始化与语言切换时调用，**不能放进 render()** ——
 *   那会每次都重建 <details>，把用户展开/收起的状态重置掉。
 */

/** 预设只动这几项，其余保持当前值。 */
const PRESETS: any[] = [
  { name: "presetFps", desc: "presetFpsDesc", cpi: 400, snap: 0, ripple: 0, sync: 0, lod: 1.0 },
  { name: "presetMoba", desc: "presetMobaDesc", cpi: 800, snap: 0, ripple: 0, sync: 0, lod: 1.0 },
  { name: "presetDesktop", desc: "presetDesktopDesc", cpi: 1600, snap: 1, ripple: 0, sync: 0, lod: 2.0 },
  { name: "presetArt", desc: "presetArtDesc", cpi: 800, snap: 1, ripple: 1, sync: 0, lod: 2.0 },
];

function applyPreset(p: any) {
  for (let n = 0; n < 4; n++) {
    const split = S.stage.cpi[n][0];          // 保留 XY 独立开关，独立时不动 Y
    S.stage.cpi[n] = [split, p.cpi, split ? S.stage.cpi[n][2] : p.cpi];
  }
  S.stage.angleSnap = p.snap;
  S.stage.ripple = p.ripple;
  S.stage.motionSync = p.sync;
  S.stage.lodMM = p.lod;
  render();
  banner("warn", t("presetFilled"));
}

export function renderHelp() {
  const bar = $("presetBar");
  if (bar) {
    bar.innerHTML =
      `<label class="presetLabel" style="min-width:auto">${t("preset")}</label>` +
      PRESETS.map((p, i) => `<button class="ghost" data-preset="${i}" title="${t(p.desc)}">${t(p.name)}</button>`).join("") +
      `<span class="muted">${t("presetNote")}</span>`;
    bar.querySelectorAll("button[data-preset]").forEach((el: any) => {
      el.onclick = () => applyPreset(PRESETS[+el.dataset.preset]);
    });
  }
  const fill = (id: string, keys: string[]) => {
    const box = $(id);
    if (!box) return;
    box.innerHTML = `<details><summary>${t("helpToggle")}</summary><ul>` +
      keys.map(k => `<li>${t(k)}</li>`).join("") + `</ul></details>`;
  };
  fill("sensorHelp", ["helpLod", "helpAngleSnap", "helpRipple", "helpAngleTune", "cpiHint"]);
  fill("perfHelp", ["helpPolling", "helpMotionSync", "helpSlamclick", "helpJitter", "helpMaxFps", "helpMulti", "helpPower", "helpDeepSleep"]);
}

