/** 界面渲染：把 S 里的状态写成 DOM。
 *
 *  事件绑定就地写在渲染函数里（控件是渲染时动态建出来的，每次渲染后重绑），
 *  所以本模块引用 device-xm1 的 xm1Apply。依赖方向是 render → device，单向。
 */
import { $, $el, banner } from "./util.js";
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
/* 点击过滤的可选值（运行时生成，避免多一张重复的表）。
 *  ★ value 必须是**数字**（0 表示关闭），不能是 "off" 这类文本：
 *    下拉的 value 要与 blob 里的字节值 String(filter) 精确相等才能选中，
 *    而 onchange 也要靠 +value 解析回数字。文本 value 会导致两处都失效
 *    ——选不中（显示空白），且 +"off" 得到 NaN。
 *    0xF0 / 0xF1 两个特例也同理，必须给数字 0xF0 / 0xF1。 */
export function filterOpts(): [number, string][] {
  const o: [number, string][] = [[0, t("off")]];
  for (let i = 1; i <= 15; i++) o.push([i, String(i)]);
  return o;
}
/** 点击过滤槽的数量：协议只给前 5 个按键提供槽位
 *  （0x15 帧 p[4..8] = blob 的 0x3D/0x44/0x4B/0x52/0x59）。 */
export const FILTER_SLOTS = 5;
/** 过滤值的两个特例：GX Safe / GX Speed（官方只给左右键用）。 */
export const GX_SAFE = 0xF0;
export const GX_SPEED = 0xF1;

/** 每档的 LED 色点 class —— 与 STAGE_COLORS 的「蓝/绿/黄/红」一一对应。
 *  4k 固件不提供每档 RGB（那是 XM2we 族才有的），所以色点是 CSS 硬编码的形状，
 *  颜色语义靠「第 n 档 = 第 n 色」的固定约定。 */
export const STAGE_DOT_CLASS = ["blue", "green", "yellow", "red"];

export function setConn(on: boolean, text: string) { const p = $el("connState"); p.className = "status-pill" + (on ? "" : " off"); p.textContent = text; }

/* ---------- 设备仪表盘（hero）的展示层 ----------
   只读 S 里的值，**不参与任何写入判定**：电量环、三格指标都是纯展示，
   拿不到数值就显示「—」。这样未连接 / 只读型号也不会出现「0%」这种假数据。 */
function paintBattery() {
  const ring = document.getElementById("batRing");
  if (!ring) return;
  const b = S.battery;
  const has = typeof b === "number" && isFinite(b) && b >= 0;
  const pct = has ? Math.max(0, Math.min(100, b)) : 0;
  ring.classList.toggle("empty", !has);
  /* pathLength="100" 把整圈归一化成 100，所以这里直接写偏移量：
     82% → dashoffset 18（画出 82 个单位）。 */
  const fill = ring.querySelector<SVGCircleElement>(".batFill");
  if (fill) fill.style.strokeDashoffset = String(100 - pct);
}

function setMetric(id: string, v: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

/** 回报率编码 → 显示值。0x80 是「1000 Hz 省电」、0x40 是「125 Hz 办公」，
 *  指标里只给频率，细分语义留给下拉框。 */
function pollLabel(): string {
  const map: Record<number, string> = {
    0x01: "8000 Hz", 0x02: "4000 Hz", 0x04: "2000 Hz",
    0x08: "1000 Hz", 0x80: "1000 Hz", 0x40: "125 Hz",
  };
  return map[S.stage.polling] ?? "—";
}

export function fillSelect(sel: HTMLSelectElement, opts: (string | number)[][], val: string | number) {
  sel.innerHTML = "";
  for (const [v, tt] of opts) {
    const o = document.createElement("option"); o.value = String(v); o.textContent = String(tt); sel.appendChild(o);
  }
  sel.value = String(val);
}

/** 型号说明 → 右栏顶部的折叠说明卡。
 *
 *  ★ 2026-10-20：此前两族的说明都是**塞在表格 tbody 里**的一行
 *    （`<tr><td colspan="5" class="muted">`）—— 会被列宽挤成密排小字，
 *    而且和页顶横幅重复（XM1 的 xm1EditNote 同时出现在两处）。
 *    统一挪到卡内右栏顶部的 <details> 里：两族同位置、默认收起不撑高。
 *    页顶横幅则一律是绿色一行的状态条（bReadOk / bReadOkXm1）。 */
export function setSensorNote(kind: "fourK" | "xm1") {
  const body = $("sensorNoteBody");
  if (!body) return;
  body.textContent = kind === "xm1" ? t("xm1EditNote") : t("xyHint");
}

export function renderXm1() {
  /* S.xm1Edit 为 null 说明 XM1 配置还没成功读出来（session.ts:82 的 catch
     分支也会走到这里）。此时下面每处 S.xm1Edit.stages 都会抛，
     故先给出提示并返回——**这是本次收敛 S 时暴露的真实风险**，
     此前 S 是 any，编译器不会报，实际跑到这里会白屏。 */
  if (!S.xm1Edit) {
    $el("iModel").textContent = S.mouseName;
    paintBattery();
    setMetric("mCpi", "—"); setMetric("mPoll", "—"); setMetric("mStage", "—");
    return;
  }
  // 提取局部别名：判空结果不会传进下面的闭包，闭包里再用 S.xm1Edit 会重新报错。
  // 这一行是收敛 S 时最需要的改动——它同时让「此处已判空」对类型系统可见。
  const ed = S.xm1Edit;
  $el("iModel").textContent = S.mouseName;
  /* ★ 2026-10-20 左栏信息位补齐：此前 XM1 这几行是裸「—」，
     与 4k 族（每行都有值）看上去像"坏了一半"。现在统一两族的**行结构**，
     值不可知时写明原因，而不是一个破折号：
       · 鼠标固件：XM1 命令表里没有固件查询命令（session.ts 的注释有记）
       · 接收器固件：有线直连，没有接收器这个概念
       · 电量：XM1 协议无电量命令 —— ★ 不能写成「无电池」，
              XM1 是有线供电的，措辞会被读成硬件事实错误
       · 回报率：由鼠标底部的 3 档拨动开关决定，软件读不到 */
  $el("iMouseFw").textContent = t("fwUnreadable");
  $el("iDongleFw").textContent = t("dongleFwNA");
  $el("iBattery").textContent = t("batteryUnreadable");
  $el("iConn").textContent = t("wiredMode");
  $el("iGen").textContent = "2020 (XM1)";

  /* 仪表盘指标：XM1 的回报率由底部硬件拨动开关决定，软件读不到；
     档位固定 4 档（表内单选当前档）。 */
  paintBattery();
  const cur = ed.stages[ed.active] ?? ed.stages[0];
  setMetric("mCpi", cur ? String(cur.x) : "—");
  setMetric("mPoll", t("pollHwSwitch"));
  setMetric("mStage", `${ed.active + 1} / 4`);
  /* 指标的 title 说明「为什么是这个值」—— 裸值看不出分母含义的差别。 */
  const mPoll = $("mPoll"); if (mPoll) mPoll.title = t("pollHwSwitchTip");
  const mStage = $("mStage"); if (mStage) mStage.title = t("stageFixed4");

  // 表头由 layout.ts 的 applyLayout("xm1") 设置（XM1 是单值 CPI，固件只读 X）

  const tb = $el<HTMLTableSectionElement>("cpiRows");
  tb.innerHTML = "";
  if (!S.blob || !S.blob.length || !ed) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">${t("bRead")}</td>`;
    tb.appendChild(tr);
    return;
  }

  ed.stages.forEach((st: any, i: number) => {
    const tr = document.createElement("tr");
    /* ★ 2026-10-20 列语义与 4k 族统一为「档位 | 启用 | 当前 | CPI X | CPI Y」：
       · 档位：没有色点（XM1 无 LED 颜色概念）
       · 启用：XM1 有**真实的逐档启用字节**（每档 6 字节 [启用][填充][X][Y]），
                所以这里可以自由勾选，不受 4k 那种「前缀」约束
       · 当前：radio（name 与 4k 统一为 cpiActive）
       · CPI Y：XM1 固件只读 X、忽略 Y（实测确认）→ 置灰「不支持」，
                不给一个改了也写不进去的输入框 */
    tr.innerHTML =
      `<td>CPI ${i + 1}</td>` +
      `<td><input type="checkbox" data-on="${i}"${st.on ? " checked" : ""}></td>` +
      `<td><input type="radio" name="cpiActive" data-act="${i}"${ed.active === i ? " checked" : ""}></td>` +
      `<td><input type="number" data-x="${i}" min="50" max="30000" step="50" value="${st.x}"></td>` +
      `<td class="na" title="${t("xm1YIgnoredTip")}">${t("notSupported")}</td>`;
    // XM1 恒走默认档（50–30000/步进 50）：它的步进是 2026-10-08 实测确认过的，不随 gen 放宽
    tb.appendChild(tr);
  });
  // 事件：直接改编辑状态，不立即写设备
  tb.querySelectorAll<HTMLInputElement>("input[data-on]").forEach((el) => {
    el.onchange = () => { ed.stages[+el.dataset.on!].on = el.checked; };
  });
  tb.querySelectorAll<HTMLInputElement>("input[data-act]").forEach((el) => {
    el.onchange = () => { ed.active = +el.dataset.act!; };
  });
  tb.querySelectorAll<HTMLInputElement>("input[data-x]").forEach((el) => {
    el.oninput = () => { ed.stages[+el.dataset.x!].x = +el.value || 0; };
  });
  /* 型号说明不再塞进表格（那会被列宽挤成密排小字），改放在右栏的折叠说明卡里。 */
  setSensorNote("xm1");

  // LOD / Ripple：XM1 只有这两个传感器项已核实
  const lodSel = $el<HTMLSelectElement>("lod");
  if (lodSel) {
    fillSelect(lodSel, [[1, "1 mm"], [2, "2 mm"], [3, "3 mm"]], Math.round(ed.lodMM));
    lodSel.disabled = false;
    lodSel.onchange = () => { ed.lodMM = +lodSel.value; };
  }
  const rip = $el<HTMLSelectElement>("ripple");
  if (rip) {
    // ★ 这里原先写的是 `rip.checked`——但 ripple 是 <select>（见 index.html：
    //   <select id="ripple"><option value="0">关</option><option value="1">开</option></select>），
    //   <select> 没有 checked 属性，那两行等于给一个不存在的属性赋值，
    //   **XM1 视图的波纹开关因此从未生效**。
    //   收敛 $ 的类型时被抓出来（TS2339: Property 'checked' does not exist on
    //   type 'HTMLSelectElement'）。现按 4k 视图（L223）的同一写法改为 .value。
    rip.value = String(ed.ripple ? 1 : 0);
    rip.disabled = false;
    rip.onchange = (e: Event) => { ed.ripple = +(e.target as HTMLSelectElement).value; };
  }
  // 「启用档位数 / 当前档位」两个下拉已删除（2026-10-20）：
  // 启用与当前都由表内控件承载（XM1 的启用是真值 checkbox、当前是 radio）。
  const note2 = $("cpiActiveNote");
  if (note2) note2.textContent = "";

  // 其余控件（4k 族专属）保持禁用
  for (const id of ["btnApplyPerf", "glass", "angleSnap", "ledLiftoff", "angleTune",
                    "polling", "motionSync", "slamclick", "jitter", "maxFps", "multiclick",
                    "powerSaving", "deepSleep", "btnReset", "btnLoad"]) {
    const el = $(id);
    if (el) (el as HTMLButtonElement).disabled = true;
  }
  const apply = $el<HTMLButtonElement>("btnApplySensor");
  if (apply) { apply.disabled = !S.xm1LastRead; apply.onclick = () => { void xm1Apply(); }; }
  const save = $el<HTMLButtonElement>("btnSave"); if (save) save.disabled = false;
  const echoBtn = $el<HTMLButtonElement>("btnXm1Echo");
  if (echoBtn) { echoBtn.style.display = ""; echoBtn.disabled = !S.xm1LastRead; }
  const undo = $el<HTMLButtonElement>("btnXm1Undo");
  if (undo) {
    undo.style.display = "";
    undo.disabled = S.xm1Snaps.length < 2;
    undo.textContent = t("xm1Undo") + " (" + S.xm1Snaps.length + ")";
  }
}

export function renderInfoOnly() {
  $el("iModel").textContent = S.mouseName;
  $el("iMouseFw").textContent = "—";
  $el("iDongleFw").textContent = "—";
  $el("iBattery").textContent = "—";
  $el("iConn").textContent = t("wiredMode");
  $el("iGen").textContent = t("family4Name");
  /* 第四族只识别、不通信：没有任何可读的实时量 */
  paintBattery();
  setMetric("mCpi", "—"); setMetric("mPoll", "—"); setMetric("mStage", "—");
}

export function render() {
  /* XM1：字段已实测确认，走 renderXm1() 的受限编辑器（写入只涉及 23 个已核实字节）。 */
  if (S.xm1) return renderXm1();

  $el("iModel").textContent = S.mouseName;
  $el("iMouseFw").textContent = S.mouseFw;
  /* 有线时统一用「不适用（有线连接，无接收器）」—— 与 XM1 同一措辞。 */
  $el("iDongleFw").textContent = S.wired ? t("dongleFwNA") : S.dongleFw;
  $el("iBattery").textContent = S.battery === null ? "—"
    : (S.wired && S.battery < 100 ? t("charging", S.battery) : S.battery + " %");
  $el("iConn").textContent = S.wired ? t("wiredMode") : t("wirelessMode");
  $el("iGen").textContent = S.eightK ? t("gen8k") : (S.gen ? `v${S.gen}` : "—");

  const tb = $el<HTMLTableSectionElement>("cpiRows"); tb.innerHTML = "";
  for (let n = 0; n < 4; n++) {
    const tr = document.createElement("tr");
    const dis = n >= S.stage.levels ? "disabled" : "";
    /* XY 开关关闭 = 官方软件的单值语义：Y 显示为与 X 相同（框禁用但跟随） */
    const xyOn = S.stage.cpi[n][0] ? 1 : 0;
    const xv = S.stage.cpi[n][1], yv = xyOn ? S.stage.cpi[n][2] : S.stage.cpi[n][1];
    const bd = cpiInputBounds(S.gen);
    /* ★ 2026-10-20 列语义统一为「档位 | 启用 | 当前 | CPI X | CPI Y」（两族同构）：
       · 档位：名字 + LED 色点。蓝/绿/黄/红是「第 n 档 = 第 n 色」的固定约定，
                4k 固件不提供每档 RGB（STAGE_COLORS 只是显示用的名字表），
                所以色点只能是 CSS 硬编码的四个颜色。
       · 启用：4k **没有逐档启用字节**（每档只有 [XY位][X][Y]），它的「启用」
                语义是总数 levels（blob 0x0E）。故这列是**受约束勾选**：
                勾第 N 档连带勾上前面所有档（写 levels = N+1），
                取消第 N 档则 levels = N。勾选态即「n < levels」。
       · 当前：radio，写 S.stage.active。gen=1（v1）的硬件只认鼠标底部的
                CPI 键、软件切不了档 —— 与原下拉的 disabled 一致。
       · CPI Y 格：XY 独立勾选框 + Y 数字框并排（原来 XY 独占一列）。 */
    tr.innerHTML = `<td><span class="stageDot dot-${STAGE_DOT_CLASS[n] ?? "blue"}"></span>CPI ${n + 1}</td>
      <td><input type="checkbox" data-on="${n}" ${n < S.stage.levels ? "checked" : ""}></td>
      <td><input type="radio" name="cpiActive" data-act="${n}" ${n === S.stage.active ? "checked" : ""} ${S.gen === 1 ? "disabled" : ""}></td>
      <td><input type="number" data-x="${n}" min="${bd.min}" max="${bd.max}" step="${bd.step}" value="${xv}" ${dis}></td>
      <td class="yCell"><input type="checkbox" data-xy="${n}" ${xyOn ? "checked" : ""} ${dis}>
        <input type="number" data-y="${n}" min="${bd.min}" max="${bd.max}" step="${bd.step}" value="${yv}" ${xyOn && !dis ? "" : "disabled"}></td>`;
    tb.appendChild(tr);
  }
  /* 启用列（受约束）：4k 的「启用档位数」就是 levels，只能是 1..4 的**前缀**。
     勾第 N 档 ⇒ levels = N+1（前面全部连带勾上）；
     取消第 N 档 ⇒ levels = N（后面全部连带取消）。
     这是唯一能写回 blob 的语义 —— 固件里没有逐档 enable 位。 */
  tb.querySelectorAll<HTMLInputElement>("input[data-on]").forEach((el) => {
    el.onchange = () => {
      const n = +el.dataset.on!;
      if (el.checked) S.stage.levels = Math.max(S.stage.levels, n + 1);
      else S.stage.levels = Math.min(S.stage.levels, n);
      /* levels 变了，勾选态与各行的 disabled 都要跟着变 —— 重画一次。 */
      render();
    };
  });
  /* 当前档：radio。gen=1 时硬件只认鼠标底部的 CPI 键，不能软件切。 */
  tb.querySelectorAll<HTMLInputElement>("input[data-act]").forEach((el) => {
    el.onchange = () => { S.stage.active = +el.dataset.act!; render(); };
  });
  tb.querySelectorAll<HTMLInputElement>("input[data-xy]").forEach((el) => el.onchange = () => {
    const n = +el.dataset.xy!; S.stage.cpi[n][0] = el.checked ? 1 : 0;
    const yEl: any = tb.querySelector(`input[data-y="${n}"]`);
    yEl.disabled = !el.checked;
    /* 取消独立 → 立刻回到单值语义：Y 同步为 X，
       不留下"开关关着、两个值却不同"的中间状态。 */
    if (!el.checked) { S.stage.cpi[n][2] = S.stage.cpi[n][1]; yEl.value = String(S.stage.cpi[n][1]); }
  });
  tb.querySelectorAll<HTMLInputElement>("input[data-x],input[data-y]").forEach((el) => el.onchange = () => {
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
  /* 开关含义提示：改到右栏的折叠说明卡里（两族同位置，见 setSensorNote）。 */
  setSensorNote("fourK");

  /* 「启用档位数 / 当前档位」两个下拉已删除（2026-10-20）：
     启用改由表内受约束勾选承载、当前改由表内 radio 承载 ——
     两个下拉与表内控件是同一份状态的两个入口，必然漂移。
     v1（gen=1）的硬件只认鼠标底部的 CPI 键，这条提示留在表格下方。 */
  $el("cpiActiveNote").textContent = S.gen === 1 ? t("v1StageNote") : "";

  const lodSel = $el<HTMLSelectElement>("lod");
  if (S.gen === 1 || S.stage.glass) {
    fillSelect(lodSel, [[1,"1.0 mm"],[2,"2.0 mm"]], Math.round(S.stage.lodMM));
  } else {
    const opts: [number, string][] = [];
    for (let i = 7; i <= 17; i++) opts.push([i / 10, (i / 10).toFixed(1) + " mm"]);
    fillSelect(lodSel, opts, +S.stage.lodMM.toFixed(1));
  }
  lodSel.onchange = (e: Event) => S.stage.lodMM = +(e.target as HTMLSelectElement).value;
  $el<HTMLSelectElement>("glass").value = String(S.stage.glass);
  $el<HTMLSelectElement>("glass").disabled = S.gen !== 2;
  $el("glass").onchange = (e: Event) => {
    const g = +(e.target as HTMLSelectElement).value; const old = S.stage.glass;
    S.stage.glass = g;
    if (g !== old) {
      if (g === 1) S.stage.lodMM = S.stage.lodMM <= 0.8 ? 1 : 2;
      else S.stage.lodMM = S.stage.lodMM === 1 ? 1.0 : 1.7;
    }
    render();
  };
  $el<HTMLSelectElement>("angleSnap").value = String(S.stage.angleSnap); $el<HTMLSelectElement>("angleSnap").onchange = (e: Event) => S.stage.angleSnap = +(e.target as HTMLSelectElement).value;
  $el<HTMLSelectElement>("ripple").value = String(S.stage.ripple); $el<HTMLSelectElement>("ripple").onchange = (e: Event) => S.stage.ripple = +(e.target as HTMLSelectElement).value;
  $el<HTMLSelectElement>("ledLiftoff").value = String(S.stage.ledLiftoff); $el<HTMLSelectElement>("ledLiftoff").onchange = (e: Event) => S.stage.ledLiftoff = +(e.target as HTMLSelectElement).value;
  /* ★ 角度调校**只读**：v2 专属字段的位置存在两说（4k 分块写的 payload[5] ↔
     blob[0x01] 与 8k 交叉印证的 blob[0x70]）。读写若指向不同字节，就是"读 A 写 B"——
     设备拿到的是我们从未展示过的值。真机改值回读定论前，这里不开放编辑。 */
  $el<HTMLInputElement>("angleTune").value = String(S.stage.angleTune);
  $el<HTMLInputElement>("angleTune").disabled = true;
  $el("angleTune").title = t("angleTuneNote");

  const pollSel = $el<HTMLSelectElement>("polling");
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
  $el("pollNote").textContent = S.wired ? t("pollWiredNote") : "";
  pollSel.onchange = (e: Event) => S.stage.polling = +(e.target as HTMLSelectElement).value;
  $el<HTMLSelectElement>("motionSync").value = String(S.stage.motionSync); $el<HTMLSelectElement>("motionSync").onchange = (e: Event) => S.stage.motionSync = +(e.target as HTMLSelectElement).value;
  S.stage.slamclick = !!(S.stage.flags & 1);
  $el<HTMLSelectElement>("slamclick").value = S.stage.slamclick ? "1" : "0"; $el<HTMLSelectElement>("slamclick").onchange = (e: Event) => S.stage.slamclick = !!(e.target as HTMLSelectElement).value;
  /* 注意：行级显示（rowV1Jitter / rowV2Max / rowV2Multi 等）**统一由 layout.ts 负责**，
     这里不再设置 display —— 两处各自切换会互相打架（8k 就同时踩到这一点）。 */
  S.stage.jitter = !!(S.stage.flags & 0x10);
  $el<HTMLSelectElement>("jitter").value = S.stage.jitter ? "1" : "0"; $el<HTMLSelectElement>("jitter").onchange = (e: Event) => S.stage.jitter = !!(e.target as HTMLSelectElement).value;
  S.stage.maxFps = !!(S.stage.flags & 0x40);
  $el<HTMLSelectElement>("maxFps").value = S.stage.maxFps ? "1" : "0"; $el<HTMLSelectElement>("maxFps").onchange = (e: Event) => S.stage.maxFps = !!(e.target as HTMLSelectElement).value;
  S.stage.multiclick = !!(S.stage.flags & 0x20);
  $el<HTMLSelectElement>("multiclick").value = S.stage.multiclick ? "1" : "0"; $el<HTMLSelectElement>("multiclick").onchange = (e: Event) => S.stage.multiclick = !!(e.target as HTMLSelectElement).value;
  const toOpts: [string | number, string][] = [["off", t("minutes") === "min" ? "Off" : "关闭"]];
  for (let i = 1; i <= 120; i++) toOpts.push([i, t("minutesFmt", i)]);;
  fillSelect($el<HTMLSelectElement>("powerSaving"), toOpts, S.stage.powerSaving); $el<HTMLSelectElement>("powerSaving").value = String(S.stage.powerSaving);
  $el("powerSaving").onchange = (e: Event) => S.stage.powerSaving = (e.target as HTMLSelectElement).value === "off" ? "off" : +(e.target as HTMLSelectElement).value;
  fillSelect($el<HTMLSelectElement>("deepSleep"), toOpts, S.stage.deepSleep); $el<HTMLSelectElement>("deepSleep").value = String(S.stage.deepSleep);
  $el("deepSleep").onchange = (e: Event) => S.stage.deepSleep = (e.target as HTMLSelectElement).value === "off" ? "off" : +(e.target as HTMLSelectElement).value;

  /* ★ 按键表：**一张表 8 行 3 列**（按键 | 映射 | 点击过滤）。
   * 此前是两个并排的独立 table：左表 8 行（#btnRows，读 blob 真值）、
   * 右表 5 行（#filterRows，写一个从不被赋值的假数组）——
   * 行数不同、行高不同（有 <select> 的那行更高），永远对不齐，
   * 而且两边显示的根本不是同一份数据。合并后行数一致、下拉直接编辑真值。 */
  const br = $el("btnRows"); br.innerHTML = "";
  S.stage.buttons.forEach((btn: any, i: number) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${BTN_NAMES[LANG]?.[i] ?? i + 1}</td><td>${describeMap(btn)}</td><td></td>`;
    br.appendChild(tr);
    const cell = tr.children[2] as HTMLTableCellElement;
    /* 协议只有 5 个过滤槽（0x15 帧的 p[4..8] = blob 的 0x3D/0x44/0x4B/0x52/0x59），
       第 6~8 个按键没有槽位 —— 置灰说明，不给一个改了也写不进去的下拉。 */
    if (i >= FILTER_SLOTS) {
      const na = document.createElement("span");
      na.className = "na";
      na.textContent = t("filterUnsupported");
      na.title = t("filterUnsupported");
      cell.appendChild(na);
      return;
    }
    const sel = document.createElement("select");
    sel.dataset.f = String(i);
    cell.appendChild(sel);
    const opts: [number, string][] = filterOpts();
    /* 官方工具只有左右键两个过滤滑条（.rsrc: Left/Right Button Multiclick Filter），
       且 0xF0/0xF1 两个特例正是给这两键用的。 */
    if (i <= 1) opts.push([GX_SAFE, t("gxSafe")], [GX_SPEED, t("gxSpeed")]);
    /* 设备上的值可能不在选项表里（例如官方上限是 25 而我们只列到 15）——
       那就把这个值本身补进选项，否则下拉会**一个都不选中**（显示空白），
       用户看到的就不是设备当前配置。 */
    if (!opts.some((o) => o[0] === btn.filter)) opts.push([btn.filter, String(btn.filter)]);
    fillSelect(sel, opts as any, btn.filter);
    sel.value = String(btn.filter);
    sel.onchange = (e: Event) => { btn.filter = +(e.target as HTMLSelectElement).value; };
  });

  /* 「没读到配置就不给写」的界面侧体现：按钮直接禁用，而不是等用户点了才弹错。
     8k 例外：它的 gen 恒为 null，但**允许点** —— 点了会弹"未验证型号"确认框（guard4k），
     确认后才放行。这是远程志愿者唯一能帮我们验证 8k 写入的入口，不能置灰堵死。 */
  const canWrite = !!S.blob && !S.unverified && (S.eightK || !!S.gen);
  for (const id of ["btnApplySensor", "btnApplyPerf", "btnReset"]) {
    const el = $(id);
    if (el) (el as HTMLButtonElement).disabled = !canWrite;
  }
  /* 导入与配对对 8k 一律关掉，与确认无关：
     · 导入 = 整块覆盖，导入别型号的 blob 等于把未知偏移全改写（XM1 事故的形态）；
     · 配对 = 无线专属命令，对有线 8k 没有意义，行为未知。 */
  for (const id of ["btnLoad", "btnPair", "btnPairDefault"]) {
    const el = $(id);
    if (el) (el as HTMLButtonElement).disabled = !canWrite || !!S.eightK;
  }

  /* 未真机验证的型号：禁用全部写入入口（guard4k 还会再兜一层）。
     读取、导出照常可用 —— 只读本身是有价值的，写入必须等硬件确认。 */
  if (S.unverified) {
    /* cpiLevels / cpiActive 两个下拉已于 2026-10-20 删除（启用与当前改由表内控件承载）。 */
    for (const id of ["btnApplySensor", "btnApplyPerf", "btnReset", "btnLoad",
                      "lod", "glass", "angleSnap", "ripple",
                      "ledLiftoff", "angleTune"]) {
      const el = $(id);
    if (el) (el as HTMLButtonElement).disabled = true;
    }
    /* 表内的 CPI 输入框也要禁掉 —— 否则用户能改数字却点不动"应用"，
       像是页面坏了，而不是"这个型号暂不支持写入"。 */
    document.querySelectorAll<HTMLInputElement>("#cpiRows input").forEach((el) => { el.disabled = true; });
  }

  /* 仪表盘：电量环 + 三格指标。放在最后统一刷新，避免上面任何 early return 漏掉。 */
  paintBattery();
  setMetric("mCpi", String(S.stage.cpi[S.stage.active][1]));
  setMetric("mPoll", pollLabel());
  setMetric("mStage", `${S.stage.active + 1} / ${S.stage.levels}`);
  /* 档位指标的分母在两族下含义不同（4k = 启用的档位数，XM1 = 固定 4 档），
     数值本身都没错，但光看数字看不出差别 —— title 里说明。 */
  const mStage = $("mStage"); if (mStage) mStage.title = t("stageEnabledCount");
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
  /* ★ XM1 不显示预设条（layout 的 xm1 rows 不含 presetBar），
     这里再加一道守卫：万一按钮还在（DOM 常驻），也不该改 XM1 的编辑状态 ——
     此前 XM1 下点预设会改 S.stage 然后 render() 短路到 renderXm1()，
     界面没变却弹「预设已填」，是"点了没反应"的坏体验。 */
  if (S.xm1) return;
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
    bar.querySelectorAll<HTMLButtonElement>("button[data-preset]").forEach((el) => {
      el.onclick = () => applyPreset(PRESETS[+(el.dataset.preset ?? 0)]);
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

