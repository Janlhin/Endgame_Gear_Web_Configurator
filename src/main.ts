// 应用主体：全局状态 / 传输层 / blob 读写解析 / UI 渲染 / 连接与事件绑定
import { $, sleep, hex, log, banner } from "./util.js";
import { LANG, t, applyI18n } from "./i18n.js";
import { VID, VID_22D4, DONGLE_PID, MOUSE_PIDS, RPT_CMD, RPT_BULK,
         XM1_MAX_STAGES, XM1_SETTLE_MS, isXm1, modelOf,
         buildXm1BlobReport, buildXm1ByteReport,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte,
         PID_8K, is8k, PID_FAMILY4, isFamily4, USAGE_FAMILY4,
         buildBlob8k, build8kStoreData } from "./protocol.js";
import { isXm2weFamily } from "./xm2we.js";
import { applyLayout, layoutFor, applyLayoutFromHash, reapplyLayout } from "./layout.js";
import { openXm2we, closeXm2we, refreshWe, bindXm2weUI, isXm2weOpen } from "./xm2we-ui.js";
import { S, newStage } from "./state.js";
import { rawReceive, transact, guarded, probe, StatusError, xm1WriteDisabled } from "./transport.js";
import { snapSensor, verifySensor, snapPerf, verifyPerf, snapButtons, verifyButtons, reportVerify } from "./verify.js";
import { looksLikeBlob, looksLikeBlob8k, parseBlob, buildSensorPayload, buildPowerPayload, xm1Parse,
         XM1_F, XM1_STAGE_ON, xm1LodToMm, xm1MmToLod } from "./blob.js";
import { readBlobXm1, writeBlobXm1, xm1QueryByte, xm1Snapshot, xm1Apply } from "./device-xm1.js";
import { readBlob8k, store8k, verifySensor8k, verifyPerf8k } from "./device-8k.js";
import { readBlob } from "./device-4k.js";

// —— 语言切换时重渲染（i18n.ts 通过事件解耦） ——
/* 语言切换：applyI18n() 已在 i18n.ts 的 onchange 里跑过，这里补上
   「由 t() 生成的表头」与各卡片的重渲染。 */
document.addEventListener("langchange", () => { reapplyLayout(); render(); });

/* ★ 这两张表按 LANG 直接取用（取不到就是 undefined → 崩）。
   新增语言时必须同步补齐 —— re/i18n_audit.mjs 会校验它们覆盖了全部语言。 */
const STAGE_COLORS = {
  "zh-CN": ["蓝", "绿", "黄", "红"], "zh-TW": ["藍", "綠", "黃", "紅"],
  "en": ["Blue", "Green", "Yellow", "Red"], "de": ["Blau", "Grün", "Gelb", "Rot"],
  "fr": ["Bleu", "Vert", "Jaune", "Rouge"], "es": ["Azul", "Verde", "Amarillo", "Rojo"],
  "ja": ["青", "緑", "黄", "赤"], "ko": ["파랑", "초록", "노랑", "빨강"],
};
const BTN_NAMES = {
  "zh-CN": ["左键", "右键", "中键", "后退", "前进", "特殊(CPI)", "滚轮上", "滚轮下"],
  "zh-TW": ["左鍵", "右鍵", "中鍵", "後退", "前進", "特殊(CPI)", "滾輪上", "滾輪下"],
  "en": ["Left", "Right", "Middle", "Back", "Forward", "Special (CPI)", "Wheel up", "Wheel down"],
  "de": ["Links", "Rechts", "Mitte", "Zurück", "Vor", "Spezial (CPI)", "Rad auf", "Rad ab"],
  "fr": ["Gauche", "Droite", "Milieu", "Retour", "Avant", "Spécial (CPI)", "Molette haut", "Molette bas"],
  "es": ["Izquierdo", "Derecho", "Central", "Atrás", "Adelante", "Especial (CPI)", "Rueda arriba", "Rueda abajo"],
  "ja": ["左", "右", "中", "戻る", "進む", "特殊(CPI)", "ホイール上", "ホイール下"],
  "ko": ["왼쪽", "오른쪽", "가운데", "뒤로", "앞으로", "특수(CPI)", "휠 위", "휠 아래"],
};
const FILTER_OPTS = [["off","off"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["11","11"],["12","12"],["13","13"],["14","14"],["15","15"]];


/* 共享可变状态集中在 ./state.js（拆 main.ts 时搬走）：
   这些量被传输层、各设备族、渲染层共同读写，放一处才能避免模块间循环引用。
   引用统一写作 S.xxx —— 一眼可辨「这是跨模块状态」而不是局部量。 */
function setConn(on, text) { const p = $("connState"); p.className = "status-pill" + (on ? "" : " off"); p.textContent = text; }

/* 读 1024B 配置 blob。两种响应格式（真机证据见 re/PROTOCOL_NOTES.md）：
     v1: [0xA0][status@1][保留×14][blob@16]
     v2: [0xA0][回显0xA1@1][status@2][保留×14][blob@17] —— v2 固件在 0xA0 报告里回显请求报告 ID，
         导致 v1 格式在 [1] 读到 0xA1 而误判"未备好"（此前误诊为时序问题，重试无效）。
   XM1（2020 变体）用命令 0x07 读 blob（4k 族用 0x12），状态字节在 [1]，blob 同样在偏移 16
   （官方函数 0x40FB90：mov dword [buf], 0x8A0 → 线上 A0 08 00 00，rep movsd 1024B）。
   由于 XM1 的 blob 字段语义尚未逐字段核实（重排层 0x40FD60 待解），
   这里只做宽松校验并把原始 blob 原样保留，便于真机比对。 */



/* ---------------- XM1 读取配置 ----------------
 *
 * ★★★ 2026-10-09 第二次修正：这次是**真正的读取路径**。★★★ ★★★
 *
 * 事故经过：此前我把**写**路径当成了读——用 0xA0 + 1024B 全零 blob 发出，
 * 设备执行了「应用这份配置」，把用户鼠标的 DPI/CPI 清零。
 *
 * 修正依据：对官方函数 0x40FC80 做完整反汇编后，发现**读**与**写**的报文
 * 形态根本不同 —— 读是「空请求 + 读回」，写是「装载 + 下发」：
 *
 * 【读】官方 0x40FC80（本次实现依据）
 *   ① memset(64B, 0) / buf = 0x7A1 (线上 A1 07 00 00) / 参数区清零
 *      ebx=0，所以 `mov dword [ebp-0x40], ebx` 只是清零参数区，
 *      **不含任何配置数据** ← 这是我上次误读成"负载"的地方
 *      ★ WebHID 侧对应：reportId=0xA1，data=buf[1..] 的 63 字节
 *   ② SetFeature(64B) → Sleep(80)          ← 空请求：只说"给我配置"
 *   ③ memset(1041B, 0) / buf[0] = 0xA1      ← 官方在 Windows API 里设的请求 ID
 *   ④ GetFeature(1041B)                     ← ★ 设备回送 [0xA0][0x01 状态][…数据…]
 *      （实测反推：日志 `a1 a0 01 00…` ⇒ 设备真实返回 [0xA0, 0x01, 0x00, …]，
 *        0xA0 是报告的 ID、0x01 是状态。WebHID 侧用 receiveFeatureReport(0xA0)，
 *        与 4k 族读大报告的写法一致；用 0xA1 会让 rawReceive 多补一字节造成错位。）
 *   ⑤ cmp byte [buf+1], 1                   ← 状态判定（XM1 有状态字节，在 [1]）
 *   ⑥ rep movsd 256 dword                   ← 报告偏移 16 → blob
 *   ⑦ call 0x4103D0                         ← 重排（0x40FD60 的逆运算），本工具暂不涉及
 *
 * 【写】官方 0x40FB90（本次**不实现**，保持停用）
 *   mov dword [buf], 0x8A0 (线上 A0 08 …) / rep movsd blob → 偏移 16 / SetFeature(1041)
 *
 * ★ 安全约束（本函数严格遵守，不许放宽）：
 *   1. 只发 64B 空请求，**绝不下发 1024B 负载** —— 空请求不含配置，不会改鼠标。
 *   2. 写路径（0x40FB90）继续永久停用，直到 0x4103D0/0x40FD60 重排层逐字节核实。
 *   3. 若 GetFeature 返回长度异常或状态非 1，一律放弃重试，不做任何"补救性"发送。
 */
/* 官方 0x40FC80 构造的 64 字节报告（Windows API 视角，buf[0] 是 reportId）：
     A1 07 00 00 + 其余全 0
 *
 * ★ WebHID 的 sendFeatureReport(reportId, data) 里 **data 不含 reportId**，
 *   reportId 由第一个参数单独传。所以正确的对应是：
 *     reportId = 0xA1
 *     data     = buf[1..] 的 63 字节 → 即 [0x07, 0x00, 0x00, ... 共 63 字节]
 *   我此前误把 64 字节原样传进 data（等于在负载最前面多塞了一个 0xA1），
 *   设备回显 `a1 a0 07 00 ...` 就是这个错位。
 */
/* 构造 XM1 的 64 字节查询请求（WebHID 视角：63 字节，不含 reportId）。
   除首字节的命令码外全为 0 —— 这是**空请求**：不携带任何配置数据，
   设备无法据此改写鼠标设置。官方读路径 0x418F80 用的就是这两个命令：
     cmd 0x03 → 读一个状态/配置字节
     cmd 0x07 → 读 1024B 配置 blob
   ★ 任何**带负载**的报文（尤其 1041B）依旧禁止，见 readBlobXm1 的事故注释。 */



/* ---------------------------------------------------------------------------
 * ★ 2026-10-09 新发现：XM1 有一个配置字节存在 1024B blob **之外**
 *
 * 反汇编官方两处调用链（re/upstream/xm1_single_byte.py 可复现）：
 *
 *   读取（0x418F80）: call 0x40FA30 (cmd 0x03 读字节, 返回码须=1)
 *                     call 0x40FC80 (cmd 0x07 读 1024B blob)
 *
 *   应用（0x41A070）: call 0x40FA30 (cmd 0x03 读字节, 返回码须=1)
 *                     call 0x40E0D0 (把配置对象打包成 blob)
 *                     call 0x40FB90 (cmd 0x08 写 1024B blob)
 *                     call 0x40FAE0 (cmd 0x04 写回同一个字节, 值取自 [obj+4])
 *
 * 即「单字节」与 blob 是**两套独立存储**，同读同写。
 * 这解释了实测现象：用鼠标实体键改回报率后，导出的 blob **一个字节都没变**
 * —— 回报率（以及可能的激活档等全局量）不在 blob 里，而在那条单字节通道上。
 *
 * 因此这里只**读取**该字节用于定位其语义（读取不含负载，安全级别与 blob 读取相同）。
 * 写入（cmd 0x04）继续禁止：单字节的语义尚未确认，盲写同样是改配置。
 * ------------------------------------------------------------------------- */


/* ================= 8k 有线族（0x11 整块写）=================
 * 与 4k 无线族的差异**只有写命令**：读仍是 0x12 + 1024B blob，blob 偏移也完全一致
 * （polling 0x05 / flags 0x06 / ledLiftoff 0x08 / LOD 0x09 / angleSnap 0x0A / ripple 0x0B /
 *   motionSync 0x0C / active 0x0D / levels 0x0E / CPI 0x23+5n / glass 0x6F）。
 * 4k 用 0x14/0x15/0x16 **分块**写；8k 用 **0x11 整块**写：
 *     report = [0xA0][0x11][报告 2..15 原样][偏移 16 起 1024B blob][尾字节原样]
 * 交叉来源（两个独立实现 + 官方工具二进制）：
 *   · Creationsss/egctl (Rust, AGPL)：OP_STORE_CONFIG = 0x11a0、CONFIG_SIZE = 1041
 *   · qsxcv/UnofficialEGGWebConfig (JS)：STORE=0x11/LOAD=0x12，report CFG=0xA0/CMD=0xA1
 *   · 官方 OP1 8k / XM2 8k 工具二进制的 PID 常量
 * ⚠️ 尚未在真机上验证（手上没有 8k），所以写入严格采用**读-改-写**：
 *     未确认的字段一律保持设备刚给的值，绝不写入 0 —— 这是 XM1 事故的教训。 */

/** 8k 的 blob 结构校验（4k 那套只认 polling ∈ {2,4,8,0x40,0x80}，
 *  而 8k 的 divider 可以是 1（8000 Hz），故单独一份）。*/


/** 读 8k 配置：发 A1 12（LOAD）后轮询 0xA1/0xA0 取 1024B 帧。
 *  **不要求 64B 状态 ACK** —— 社区实现同样不轮询（只有 4k 族有那套 status 语义）。 */


/** 轮询 8k 的写 ACK（0xA1 短报告，状态字节 [1] == 0x01）。收不到不算失败，交由回读校验判定。 */


/** 8k 写：整块 1024B 读-改-写。返回是否收到 ACK。 */


/** 8k 写入后只校验「我们实际写过的字段」——LOD / 玻璃面 / 角度调校 / 最大 FPS
 *  在 8k 上的编码未验证，本工具不写也不校验（保持读回原值）。 */



/** 8k 应用：一次整块写覆盖传感器页与性能页（8k 的写是整块，不区分两张卡）。 */
async function apply8k() {
  const want = snapSensor(), wantPerf = snapPerf();
  const nb = buildBlob8k(S.blob, S.stage);               // 从读回值出发，只打补丁
  const acked = await store8k(nb);
  log(acked ? "✓ 8k STORE 已确认（ACK）" : "⋯ 8k STORE 未收到 ACK，继续回读校验");
  await refreshAll();
  reportVerify("bSensor", verifySensor8k(want).concat(verifyPerf8k(wantPerf)));
}



/* ================= blob 解析 / 编码 ================= */






/* ================= UI 渲染 ================= */
function fillSelect(sel, opts, val) {
  sel.innerHTML = "";
  for (const [v, tt] of opts) {
    const o = document.createElement("option"); o.value = v; o.textContent = tt; sel.appendChild(o);
  }
  sel.value = String(val);
}







/* ================= XM1 编辑（受限）=================
 * 可写字节被 protocol.ts 的 xm1GuardWrite 硬限制在 23 个已核实偏移内 —— UI 只是
 * 表面，真正的边界在发送层。这里负责：编辑状态、打补丁、差异预览、写入前快照、
 * 写入后回读校验。 */
let xm1Edit: any = null;

/* 快照：每次成功读取、以及每次写入前各存一份，最多 20 份，支持一键回退。 */
const xm1Snaps: { at: number; label: string; blob: Uint8Array }[] = [];


/** 把编辑状态打成一份新的 1024B（只动 XM1_F 里登记的偏移）。 */


/** 偏移 → 人话字段名（用于差异预览） */


/** 应用编辑：差异预览 → 快照 → 写入 → 回读校验 */


/* XM1 视图：显示并编辑已实测确认的传感器字段。
   ★ 读取路径按官方 0x40FC80；写入按官方 0x41A070 事务（cmd 0x03 + 0x08 + 0x04），
     2026-10-09 回声闭环真机验证通过（re/XM1_NOTES.md 6.13/6.14）。
   ★ 写入边界：只允许改动 XM1_EDITABLE_OFFSETS 里的 23 个字节（全部经差分实测确认），
     其余字节必须与刚读回的数据逐字节一致 —— 由 protocol.ts 的 xm1GuardWrite 强制。
   ★ CPI 是**单值**：XM1 固件只读取 X、忽略 Y（6.15 节，实测 + 协议层双重印证）。 */
function renderXm1() {
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

  S.xm1Edit.stages.forEach((st, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>CPI ${i + 1}</td>` +
      `<td><input type="checkbox" data-on="${i}"${st.on ? " checked" : ""}></td>` +
      `<td style="text-align:center"><input type="radio" name="xm1act" data-act="${i}"${S.xm1Edit.active === i ? " checked" : ""}></td>` +
      `<td colspan="2"><input type="number" data-x="${i}" min="50" max="30000" step="50" value="${st.x}"></td>`;
    tb.appendChild(tr);
  });
  // 事件：直接改编辑状态，不立即写设备
  tb.querySelectorAll("input[data-on]").forEach(el => {
    el.onchange = () => { S.xm1Edit.stages[+el.dataset.on!].on = el.checked ? 1 : 0; };
  });
  tb.querySelectorAll("input[data-act]").forEach(el => {
    el.onchange = () => { S.xm1Edit.active = +el.dataset.act!; };
  });
  tb.querySelectorAll("input[data-x]").forEach(el => {
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
/* 第四协议族（XM1r / OP1 / OP1 RGB）专用：只填设备信息，不渲染任何可编辑控件。 */
function renderInfoOnly() {
  $("iModel").textContent = S.mouseName;
  $("iMouseFw").textContent = "—";
  $("iDongleFw").textContent = "—";
  $("iBattery").textContent = "—";
  $("iConn").textContent = t("wiredMode");
  $("iGen").textContent = t("family4Name");
}

function render() {
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
    tr.innerHTML = `<td>CPI ${n + 1}${n === S.stage.active ? t("current") : ""}</td><td>${STAGE_COLORS[LANG][n]}</td>
      <td><input type="checkbox" data-xy="${n}" ${xyOn ? "checked" : ""} ${dis}></td>
      <td><input type="number" data-x="${n}" min="50" max="30000" step="50" value="${xv}" ${dis}></td>
      <td><input type="number" data-y="${n}" min="50" max="30000" step="50" value="${yv}" ${xyOn && !dis ? "" : "disabled"}></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll("input[data-xy]").forEach(el => el.onchange = () => {
    const n = +el.dataset.xy; S.stage.cpi[n][0] = el.checked ? 1 : 0;
    const yEl: any = tb.querySelector(`input[data-y="${n}"]`);
    yEl.disabled = !el.checked;
    /* 取消独立 → 立刻回到单值语义：Y 同步为 X，
       不留下"开关关着、两个值却不同"的中间状态。 */
    if (!el.checked) { S.stage.cpi[n][2] = S.stage.cpi[n][1]; yEl.value = String(S.stage.cpi[n][1]); }
  });
  tb.querySelectorAll("input[data-x],input[data-y]").forEach(el => el.onchange = () => {
    const n = +(el.dataset.x ?? el.dataset.y); const ax = el.dataset.x ? 1 : 2;
    const v = Math.max(10, Math.min(30000, +el.value || 400));
    (el as any).value = String(v);                       // clamp 后回显
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
  $("cpiLevels").onchange = e => S.stage.levels = +e.target.value;
  const actSel = $("cpiActive");
  fillSelect(actSel, [[0,"CPI 1"],[1,"CPI 2"],[2,"CPI 3"],[3,"CPI 4"]], S.stage.active);
  actSel.disabled = S.gen === 1;
  $("cpiActiveNote").textContent = S.gen === 1 ? t("v1StageNote") : "";
  actSel.onchange = e => S.stage.active = +e.target.value;

  const lodSel = $("lod");
  if (S.gen === 1 || S.stage.glass) {
    fillSelect(lodSel, [[1,"1.0 mm"],[2,"2.0 mm"]], Math.round(S.stage.lodMM));
  } else {
    const opts = []; for (let i = 7; i <= 17; i++) opts.push([i / 10, (i / 10).toFixed(1) + " mm"]);
    fillSelect(lodSel, opts, +S.stage.lodMM.toFixed(1));
  }
  lodSel.onchange = e => S.stage.lodMM = +e.target.value;
  $("glass").value = String(S.stage.glass);
  $("glass").disabled = S.gen !== 2;
  $("glass").onchange = e => {
    const g = +e.target.value; const old = S.stage.glass;
    S.stage.glass = g;
    if (g !== old) {
      if (g === 1) S.stage.lodMM = S.stage.lodMM <= 0.8 ? 1 : 2;
      else S.stage.lodMM = S.stage.lodMM === 1 ? 1.0 : 1.7;
    }
    render();
  };
  $("angleSnap").value = String(S.stage.angleSnap); $("angleSnap").onchange = e => S.stage.angleSnap = +e.target.value;
  $("ripple").value = String(S.stage.ripple); $("ripple").onchange = e => S.stage.ripple = +e.target.value;
  $("ledLiftoff").value = String(S.stage.ledLiftoff); $("ledLiftoff").onchange = e => S.stage.ledLiftoff = +e.target.value;
  $("angleTune").value = S.stage.angleTune;
  $("angleTune").disabled = S.gen !== 2;
  $("angleTune").onchange = e => S.stage.angleTune = Math.max(-30, Math.min(30, +e.target.value || 0));

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
  pollSel.onchange = e => S.stage.polling = +e.target.value;
  $("motionSync").value = String(S.stage.motionSync); $("motionSync").onchange = e => S.stage.motionSync = +e.target.value;
  S.stage.slamclick = !!(S.stage.flags & 1);
  $("slamclick").value = S.stage.slamclick ? "1" : "0"; $("slamclick").onchange = e => S.stage.slamclick = +e.target.value;
  /* 注意：行级显示（rowV1Jitter / rowV2Max / rowV2Multi 等）**统一由 layout.ts 负责**，
     这里不再设置 display —— 两处各自切换会互相打架（8k 就同时踩到这一点）。 */
  S.stage.jitter = !!(S.stage.flags & 0x10);
  $("jitter").value = S.stage.jitter ? "1" : "0"; $("jitter").onchange = e => S.stage.jitter = +e.target.value;
  S.stage.maxFps = !!(S.stage.flags & 0x40);
  $("maxFps").value = S.stage.maxFps ? "1" : "0"; $("maxFps").onchange = e => S.stage.maxFps = +e.target.value;
  S.stage.multiclick = !!(S.stage.flags & 0x20);
  $("multiclick").value = S.stage.multiclick ? "1" : "0"; $("multiclick").onchange = e => S.stage.multiclick = +e.target.value;
  const toOpts = [["off", t("minutes") === "min" ? "Off" : "关闭"]].concat(Array.from({length:120},(_,i)=>[i+1, t("minutesFmt", i+1)]));
  fillSelect($("powerSaving"), toOpts, S.stage.powerSaving); $("powerSaving").value = String(S.stage.powerSaving);
  $("powerSaving").onchange = e => S.stage.powerSaving = e.target.value === "off" ? "off" : +e.target.value;
  fillSelect($("deepSleep"), toOpts, S.stage.deepSleep); $("deepSleep").value = String(S.stage.deepSleep);
  $("deepSleep").onchange = e => S.stage.deepSleep = e.target.value === "off" ? "off" : +e.target.value;

  const br = $("btnRows"); br.innerHTML = "";
  S.stage.buttons.forEach((btn, i) => {
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
    fillSelect(sel, opts, S.stage.filters[i]);
    sel.value = String(S.stage.filters[i]);
    sel.onchange = e => S.stage.filters[i] = +(e.target as HTMLSelectElement).value;
  });

  /* 「没读到配置就不给写」的界面侧体现：按钮直接禁用，而不是等用户点了才弹错。
     零负载命令（配对/恢复出厂）不在其列。 */
  const canWrite = !!S.blob && !!S.gen && !S.unverified;
  for (const id of ["btnApplySensor", "btnApplyPerf", "btnLoad", "btnReset", "btnPair", "btnPairDefault"]) {
    const el = $(id); if (el) el.disabled = !canWrite;
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
const writeSettle = () => S.wired ? 500 : 880;
const resetSettle = () => S.wired ? 800 : 1080;

/* ================= 写入后回读校验（4k 族） =================
   0x14 / 0x15 / 0x16 这些写入命令只回执行状态，**不回报配置内容**，
   所以"到底写进去没有"只能靠写完之后**重新读取**来确认。
   三个 apply 路径都已经调用 refreshAll()（内部 readBlob + parseBlob），
   因此校验就是：把「写入前的期望值」与「读回后的实际值」逐项比对。

   ⚠️ 刻意不校验的两类：
     · v1 的档位切换 —— v1 硬件忽略软件切换（见 v1StageNote）
     · 字节级差异 —— 设备可能对数值做规范化，语义比较更可靠 */

/** 写入前：记录传感器页期望值 */


/** 写入后：比对传感器页，返回不一致项（空数组 = 一致） */


/** 写入前：记录性能/电源页期望值（开关位从 flags 现拆，不依赖 render 是否跑过） */


/** 写入后：比对性能/电源页 */


/** 写入前：记录按键映射 */


/** 写入后：比对按键映射 */


/** 统一报告：不一致 → 列出具体项；一致 → 明确通过 */


async function applySensor() {
  if (S.eightK) return apply8k();                  // 8k 是整块写，两张卡共用一条路径
  const want = snapSensor();                     // 期望值（写入前）
  const wantPerf = snapPerf();                   // 联动写 0x15 时玻璃模式也在里面
  const glassChanged = S.gen === 2 && (S.blob[0x6F] ? 1 : 0) !== S.stage.glass;
  await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
  log("✓ cmd 0x14 written");
  if (glassChanged) {
    await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
    log("✓ glass-mode linked cmd 0x15 written");
  }
  await refreshAll();                            // 内部 readBlob + parseBlob
  const bad = verifySensor(want);
  if (glassChanged) bad.push(...verifyPerf(wantPerf));   // 联动写过的字段一并核对
  reportVerify("bSensor", bad);
}
async function applyPerf() {
  if (S.eightK) return apply8k();                  // 同上：8k 的性能项与传感器项在同一次整块写里
  const want = snapPerf();                       // 期望值（写入前）
  const wantSensor = snapSensor();               // 联动写 0x14 时传感器字段也在里面
  const glassChanged = S.gen === 2 && (S.blob[0x6F] ? 1 : 0) !== S.stage.glass;
  await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
  log("✓ cmd 0x15 written");
  if (glassChanged) {
    await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
    log("✓ glass-mode linked cmd 0x14 written");
  }
  await refreshAll();
  const bad = verifyPerf(want);
  if (glassChanged) bad.push(...verifySensor(wantSensor));
  reportVerify("bPerf", bad);
}
async function refreshAll() {
  banner("warn", "");
  try {
    /* 第四协议族（XM1r / OP1 / OP1 RGB）：只显示型号与原因，不发送任何报文。
       该族报文格式与本工具实现的三族完全不同（64B 包 + 54 条 kCom* 命令 + 口令握手），
       在没有实现之前连接它是无意义的；明确告知比"连不上"更有用。 */
    if (S.family4) {
      S.mouseName = PID_FAMILY4[S.dev.productId] || t("f4Unknown");
      S.mouseFw = "—"; S.dongleFw = "—"; S.battery = null;
      applyLayout("unsupported");
      renderInfoOnly();
      banner("warn", t("bFamily4"));
      log(`⚠ 第四协议族：VID=0x${S.dev.vendorId.toString(16)} PID=0x${S.dev.productId.toString(16)}，仅识别不通信`);
      return;
    }
    /* 8k 有线族：从 PID 即可确定型号（有线直连，无需 0x0E 查询），
       读走 0x12 + 1024B 帧，写走 0x11 整块写。 */
    if (S.eightK) {
      S.mouseName = PID_8K[S.dev.productId];
      S.mouseFw = "—"; S.dongleFw = "—"; S.battery = null;
      applyLayout("8k");
      try {
        await readBlob8k();
        parseBlob();
        render();
        banner("warn", t("b8kNote"));
        log("✓ 8k blob 已读取（写回为整块读-改-写，未确认字段原样保留）");
      } catch (e) {
        render();
        banner("err", t("bRead") + e.message);
        log("✗ " + e.message);
      }
      return;
    }
    await probe();

    /* XM1：命令表只有 4 条（0x03/0x04/0x07/0x08）——没有 0x0D 固件、0x0E 型号、
       0xB4 电量，所以跳过这些查询，直接用 0xA1 空请求读 blob。
       读取路径已按官方 0x40FC80 修正（见 readBlobXm1 上方注释）；
       写入仍停用（重排层未核实），blob 仅供只读展示。 */
    if (S.xm1) {
      S.mouseName = modelOf(VID_22D4, S.dev.productId);
      S.gen = 0;
      S.dongleFw = "—"; S.mouseFw = "—"; S.battery = null;
      /* XM1 只显示它真正有的东西：CPI（单值）/ LOD / Ripple + 备份工具。
         没有性能卡片（回报率是底部硬件开关）、没有按键卡片（按键表未验证）、
         传感器里也不显示未定位的角度/灯效项。 */
      applyLayout(layoutFor({ xm1: true }));
      try {
        /* 先读单字节（官方读取事务的第一步）：回报率等全局量不在 blob 里，
           这条通道是唯一入口。只读，不含负载。 */
        await xm1QueryByte();
        await readBlob();
        S.xm1Edit = xm1Parse(S.blob);            // 编辑状态以读回值为初始
        xm1Snapshot(t("xm1SnapRead"));
        parseBlob();
        render();
        banner("warn", t("xm1EditNote"));
        log(`✓ XM1 blob 已读取（可编辑 23 个已核实字段）`);
      } catch (e) {
        renderXm1();
        banner("err", t("bRead") + e.message);
        log("✗ XM1 读取失败: " + e.message);
      }
      return;
    }

    try { const r = await guarded(0x0D, 0x00, null, { pace: 150 }); S.dongleFw = fwStr(r[16] | (r[17] << 8)); }
    catch (e) { if (e.code !== 0x07) throw e; S.dongleFw = "—"; }
    let mouseOk = false;
    try {
      const r = await guarded(0x0E, 0x00, null, { pace: 150 });
      const pid = r[18] | (r[19] << 8);
      if (MOUSE_PIDS[pid]) {
        S.mouseName = MOUSE_PIDS[pid][0]; S.gen = MOUSE_PIDS[pid][1];
        S.unverified = MOUSE_PIDS[pid][2] === 0;
      } else {
        /* ★ fail-safe：PID 不认识 ⇒ 不知道它属于哪一族，绝不能按 4k 的偏移去写。
           此前这里是 unverified = false，等于给未知型号开了写入口。 */
        S.mouseName = `Unknown (PID 0x${pid.toString(16)})`;
        S.gen = null; S.unverified = true; S.unknownModel = true;
      }
      S.mouseFw = fwStr(r[22] | (r[23] << 8));
      mouseOk = true;
    } catch (e) { if (![0x08, 0x11].includes(e.code)) throw e; }
    try { const r = await guarded(0xB4, 0x00, null, { pace: 150 }); S.battery = r[16]; } catch (e) { S.battery = null; }
    /* 界面按型号裁剪：v1 不显示 v2 专属项，反之亦然。 */
    applyLayout(layoutFor({ unverified: S.unverified, gen: S.gen }));
    if (mouseOk) {
      await readBlob(); parseBlob(); render();
      if (S.unknownModel) banner("warn", t("bUnknownModel"));
      else if (S.unverified) banner("warn", t("bUnverifiedModel"));
      else banner("ok", t("bReadOk"));
    }
    else { render(); banner("warn", t("bSleep")); }
  } catch (e) { banner("err", t("bRead") + e.message); log("✗ " + e.message); }
}
function fwStr(v) { const h = v.toString(16).padStart(4, "0"); return `${parseInt(h.slice(0, 2), 16)}.${parseInt(h.slice(2), 16)}`; }
/* 卡片可见性统一由 layout.ts 的 applyLayout() 管理，这里不再各自 show/hide，
   避免「一处显示、另一处忘了隐藏」造成的跨型号残留。 */

/* ================= 连接 ================= */
/* ★★★ 页面卸载/关闭时必须释放已打开的 HID 接口。
 * WebHID 打开接口即独占，若页面被意外保留（浏览器崩溃、标签页恢复等），
 * 系统会一直认为该接口仍被占用 —— 极端情况下鼠标指针会一直失效。
 * 三个时机都兜一遍：beforeunload（用户关页/刷新）、pagehide（导航离开）、
 * visibilitychange 变 hidden（切走标签页，对应 macOS/Linux 的行为差异）。 */
let releasedOnHide = false;
async function releaseAllDevices() {
  try { await closeXm2we(); } catch (_) {}
  if (S.dev && S.dev.opened) { try { await S.dev.close(); } catch (_) {} }
  S.dev = null;
}
window.addEventListener("beforeunload", () => { releaseAllDevices(); });
window.addEventListener("pagehide", () => { releaseAllDevices(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || releasedOnHide) return;
  // 延迟一点再关：visibilitychange 早期关闭可能被 Chrome 拒绝
  releasedOnHide = true;
  setTimeout(() => { releaseAllDevices(); }, 50);
});

/** 安全闸门：只允许打开厂商配置集合。
 *  绝不能打开系统鼠标指针集合（UP:0001/0002）——WebHID 打开即独占该接口，
 *  Windows HID 驱动会失去访问权，导致**鼠标无法移动**（实测发生过：
 *  用户插拔无反应，必须关闭浏览器窗口才释放）。
 *  规则：宁可拒绝连接，也绝不能猜错接口。 */
/* 安全闸门：只拒绝真正会致残的系统集合。
 *
 * 事故背景（2026-10-09）：曾因 filter 里放裸 vendorId，把 XM1 的 MI_00
 * 鼠标指针集合暴露到选择器；用户选中后 WebHID 独占该接口，
 * Windows HID 驱动失去访问权 → **鼠标完全无法移动，插拔无用，
 * 必须关闭浏览器窗口才释放**。硬件与固件均无损坏。
 *
 * 因此这里**只**拦两类：
 *   · 鼠标指针  UP:0001/0002 —— 会让鼠标变砖
 *   · 键盘      UP:0001/0006 —— 会让键盘失效，同类风险
 * 其余系统集合（消费者控制 000C:0001 等）**允许**——
 * 厂商接口在 Windows 上可能同时暴露这些，误拒会让 XM1 完全连不上。
 * 只要集合里含厂商用法页（>=0xFF00），且不含指针/键盘，就放行。 */
const POINTER_PAGE = 0x0001, POINTER_USAGE = 0x0002;
const KEYBOARD_PAGE = 0x0001, KEYBOARD_USAGE = 0x0006;
const VENDOR_PAGE_MIN = 0xFF00;

function isSafeToOpen(d) {
  const cols = d.collections || [];
  if (!cols.length) return { ok: false, why: t("bNoCollections") };
  // ① 致命项：鼠标指针 / 键盘 —— 独占会让系统输入设备失效
  if (cols.some(c => c.usagePage === POINTER_PAGE && c.usage === POINTER_USAGE))
    return { ok: false, why: t("bRefusePointer") };
  if (cols.some(c => c.usagePage === KEYBOARD_PAGE && c.usage === KEYBOARD_USAGE))
    return { ok: false, why: t("bRefuseKeyboard") };
  // ② 必须含厂商集合，否则不是配置接口
  if (!cols.some(c => c.usagePage >= VENDOR_PAGE_MIN))
    return { ok: false, why: t("bNotVendor") };
  return { ok: true };
}

/** 保险丝：open() 之后再复验一次 collections，若判定危险则立即 close()。
 *  即使未来有人误加了宽泛 filter，这条也能兜住（浏览器仍可能短暂独占接口，
 *  所以必须尽快释放）。 */
async function openGuarded(d) {
  const guard = isSafeToOpen(d);
  if (!guard.ok) {
    log("✗ 拒绝打开：" + guard.why);
    banner("err", guard.why);
    return false;
  }
  await d.open();
  // open 后复验：接口集合在拿到权限后更完整，此时判断更准
  const after = isSafeToOpen(d);
  if (!after.ok) {
    log("✗ 打开后发现是系统集合，立即关闭：" + after.why);
    try { await d.close(); } catch (_) {}
    banner("err", after.why);
    return false;
  }
  return true;
}

async function openDevice(d) {
  if (!(await openGuarded(d))) return;
  S.dev = d;
  S.xm1 = isXm1(d.vendorId);
  S.eightK = !S.xm1 && is8k(d.productId);
  S.family4 = !S.xm1 && !S.eightK && (isFamily4(d.productId)
            || (d.collections || []).some((c: any) => c.usagePage === USAGE_FAMILY4.page));
  S.wired = S.xm1 || S.eightK || S.family4 || d.productId !== DONGLE_PID;
  S.lastFrame = null; S.frameAligned = false;
  /* ★ XM1 发送白名单（防止再次损坏配置）
   *
   * 【常驻放行】64B 空请求，命令码为官方**读路径**的两条查询命令：
   *     cmd 0x07（读 1024B blob）、cmd 0x03（读单字节状态）
   *   特征：63 字节、除首字节命令码外全为 0 → **不含任何配置数据**。
   *
   * 【仅 arm 时放行】官方的**写事务**三步（2026-10-09 反汇编确证）：
   *     cmd 0x08 写 blob：1041B 报告，A0 08 00 00 + buf[5]=blob[0] + 偏移16起 1024B
   *     cmd 0x04 写单字节：63B，值为 blob[0]
   *   放行条件是**逐字节回声**：载荷必须与刚读回来的那份 1024B 完全一致，
   *   且 buf[5] / cmd0x04 的值必须等于该 blob 的第 0 字节。
   *   → 发出去的每个字节都是设备刚给我们的值，配置不可能被改坏（可证明无损）。
   *
   * 【一律拦截】其余任何发送，尤其"非回声"的 1041B。
   * 依据：2026-10-09 事故（发送 0xA0 全零 1024B blob 导致 DPI/CPI 清零）。
   * 比"全禁"更精确：全禁会让 XM1 完全不可用，而上述报文可证明安全。 */
  if (S.xm1) {
    const realSend = d.sendFeatureReport.bind(d);
    const echo = () => S.xm1LastRead;
    d.sendFeatureReport = async (reportId: number, data: any) => {
      const u8 = data instanceof Uint8Array ? data : null;
      // 校验全部来自 protocol.ts（与构造函数同一源头，并有单元测试覆盖）
      const ref = echo();
      const isQuery = xm1GuardQuery(reportId, u8);                       // ① 无负载查询，常驻
      const isEchoBlob = S.xm1Armed && xm1GuardWrite(reportId, u8, ref);  // ② 写 blob（仅限已核实字段）
      const isEchoByte = S.xm1Armed && xm1GuardEchoByte(reportId, u8, ref); // ③ 回声写单字节
      if (!isQuery && !isEchoBlob && !isEchoByte) {
        log(`✗ XM1 拦截：非常规发送（reportId=${reportId}, len=${u8?.length}, cmd=${u8?.[0] ?? "?"}, armed=${S.xm1Armed}）`);
        S.xm1Armed = false;
        xm1WriteDisabled();
      }
      return realSend(reportId, data);
    };
    (d as any).__realSend = realSend;
    log("⚠ XM1：读查询常驻放行；写 blob 仅允许「原样回声」（逐字节校验），其余一律拦截");
  }
  S.dev.addEventListener("inputreport", e => {
    if (e.data.byteLength < 2) return;
    const code = e.data.getUint8(0), v = e.data.getUint8(1);
    if (code === 0xB4) { S.battery = e.data.getUint8(2); render(); log(`⚡ battery event: ${S.battery}%`); }
    else if (code === 0xB1) { log(v === 1 ? "⚡ radio link: up" : "⚡ radio link: down (mouse asleep)"); }
  });
  setConn(true, S.wired ? t("connectedWired") : t("connectedWireless"));
  $("btnRefresh").disabled = false;
  log(`✓ opened ${d.productName} VID=0x${d.vendorId.toString(16)} PID=0x${d.productId.toString(16)}`);
  await refreshAll();
}
$("btnConnect").onclick = async () => {
  log("→ 连接点击: WebHID 可用=" + ("hid" in navigator) + " 安全上下文=" + window.isSecureContext);
  if (!("hid" in navigator)) {
    const why = !window.isSecureContext && location.protocol !== "file:"
      ? (LANG === "zh-CN" ? "当前页面不是安全上下文（须 https:// 或 file://），WebHID 被禁用。" : "Page is not a secure context (https:// or file:// required); WebHID disabled.")
      : t("bNoWebhid");
    banner("err", why); return;
  }
  try {
    /* ★ 必须**一次调用传全部 filter 数组**（WebHID 数组 = OR 语义）。
       踩过的坑：曾写成「按 filter 逐个调用 requestDevice 直到有结果」——
       Chrome 每次调用都会弹选择器，而第一个 filter 若匹配不到就直接弹
       「找不到任何兼容设备」，整个流程中断，用户只看到一个空选择器。
       （插着 XM1 时 VID 0x3367 必然匹配不到，就是这个现象。）
       filter 内各字段之间是 AND，字段省略即通配。 */
    /* ★★ 安全要求：filters 里**绝不能放"只有 vendorId"的宽泛项**。
       XM1 是复合设备，MI_00 = 鼠标指针集合（UP:0001/0002）、MI_01 = 厂商集合。
       一旦 requestDevice 暴露了鼠标指针集合，用户选中它 → WebHID 打开该接口会
       **独占它**，Windows 的 HID 驱动随即失去对鼠标指针接口的访问权 →
       **鼠标完全无法移动**（实测用户反馈）。
       所以这里只列厂商配置接口（FF01:02 / FF02:02），并按 VID 精确限定。 */
    const filters = [
      { vendorId: VID,     usagePage: 0xFF01, usage: 0x02 },  // 4k 无线族 + 8k 有线族配置通道
      { vendorId: VID_22D4, usagePage: 0xFF01, usage: 0x02 },  // XM1 / XM1 RGB 配置通道
      { vendorId: VID,     usagePage: 0xFF02, usage: 0x02 },  // XM2we / OP1we 配置通道
      /* 第四族（XM1r / OP1 / OP1 RGB）：官方 Electron 工具按 usagePage 0xFFA1 / usage 0x00A5 匹配。
         本工具**不实现**该族协议，加进来只为能在界面上明确告知「已识别但不支持」，
         而不是让用户看到"找不到兼容设备"。只读、不发送任何报文。 */
      { vendorId: VID,     usagePage: USAGE_FAMILY4.page, usage: USAGE_FAMILY4.usage },
    ];
    let devs = await (navigator as any).hid.requestDevice({ filters });
    if (!devs.length) {
      /* 精确 filter 全落空 → 回退到**只列厂商用法页**的集合（仍然不会暴露鼠标指针）。
         注意：不能退到 filters:[]，那会把键盘/鼠标/摄像头全列出来，
         用户很容易误选危险接口。 */
      log("⚠ 精确配置接口未匹配到，回退到厂商用法页（FF00–FFFF）");
      banner("warn", t("bFallbackVendor"));
      devs = await (navigator as any).hid.requestDevice({
        filters: [
          { vendorId: VID,     usagePage: 0xFF00 },
          { vendorId: VID_22D4, usagePage: 0xFF00 },
        ],
      });
    }
    if (!devs.length) return;
    for (const d of devs) {
      const fam = isXm2weFamily(d.productId, d.collections) ? "XM2we/2020"
                : isXm1(d.vendorId) ? "XM1/2020" : "4k";
      log(`candidate: "${d.productName}" VID=0x${d.vendorId.toString(16)} PID=0x${d.productId.toString(16)} [${fam}] collections=` +
          (d.collections || []).map(c => `pg0x${c.usagePage.toString(16)}/u0x${c.usage.toString(16)}`).join(","));
    }
    /* 挑选优先级：
       ① XM2we 族（PID 0x1960/0x1961 明确）
       ② XM1 的**配置接口** VID 0x22D4 + FF01:02（实测该集合才是配置通道）
       ③ 任意 vendor 用法页（>=0xFF00）接口
       ④ 第一个
       注意 XM1 同时暴露 FF02:01 / FF02:02 等集合（后者与 XM2we 同页），
       所以不能只看"有没有 vendor 页"，要优先 FF01:02。 */
    const pick = devs.find(d => isXm2weFamily(d.productId, d.collections))
              || devs.find(d => isXm1(d.vendorId) && (d.collections || []).some(c => c.usagePage === 0xFF01 && c.usage === 0x02))
              || devs.find(d => isXm1(d.vendorId))
              || devs.find(d => (d.collections || []).some(c => c.usagePage >= 0xFF00))
              || devs[0];
    if (isXm2weFamily(pick.productId, pick.collections)) {
      await openXm2we(pick);
      return;
    }
    if (isXm1(pick.vendorId)) {
      const cols = (pick.collections || []).map(c => `pg0x${c.usagePage.toString(16)}/u0x${c.usage.toString(16)}`);
      log(`ℹ XM1 已打开所选集合 [${cols.join(", ")}]` +
          (pick.collections || []).some(c => c.usagePage === 0xFF01 && c.usage === 0x02)
            ? "" : " ⚠ 未选到 FF01:02 配置接口，若读取失败请改选同一设备的另一个集合");
    }
    if (pick.productId === DONGLE_PID)
      log("ℹ 已选择接收器。若鼠标此刻插着 USB 线，无线链路是断开的——请改选鼠标设备（或拔线后再连）。");
    await openDevice(pick);
  } catch (e) { banner("err", t("bConnectFail") + e.message); log("✗ " + e.message); }
};
$("btnRefresh").onclick = () => isXm2weOpen() ? refreshWe() : refreshAll();
/* 护栏：4k 族的写操作绝不能对 XM2we 族执行（协议族完全不同，会写坏 EEPROM）。
   正常路径下卡片已隐藏，这里再挡一次以防脚本/控制台误调。 */
function guard4k(needConfig = true) {
  if (isXm2weOpen()) { banner("err", t("bWrongFamily")); log("✗ blocked: XM2we device connected"); throw new Error("wrong protocol family"); }
  /* 未真机验证的型号（8k 有线族）只读：协议同构是静态实证的，
     但 gen 编码与字段语义没在硬件上确认过 —— 按未验证的偏移写回去，
     正是 2026-10-09 把 XM1 配置写坏的同一个错误。 */
  if (S.family4) {
    banner("err", t("bFamily4"));
    log("✗ blocked: 4th protocol family (0xFFA1) is not implemented");
    throw new Error("unsupported protocol family");
  }
  if (S.unverified) {
    banner("err", t(S.unknownModel ? "bUnknownModel" : "bUnverifiedModel"));
    log("✗ blocked: model not verified on hardware (read-only)");
    throw new Error("unverified model");
  }
  /* ★「没读到配置就不给写」。写入的前提是**知道设备现在是什么状态** ——
     否则 applySensor 会把界面上的初始值当成当前配置下发（stage 是 newS() 的默认值）。
     这与 2026-10-09 把 XM1 配置写坏是同一类错误：不知道当前值就发。
     零负载命令（配对 / 恢复出厂）不受此限，用 guard4k(false) 调用。 */
  /* 8k 没有 0x0E 型号查询，gen 恒为 null —— 判据换成「是否读到过 blob」。 */
  if (needConfig && (!S.blob || (!S.gen && !S.eightK))) {
    banner("err", t("bNoReadYet"));
    log("✗ blocked: no successful config read yet (write would send UI defaults)");
    throw new Error("no config read");
  }
}
$("btnApplySensor").onclick = () => { try { guard4k(); } catch { return; } applySensor().catch(e => banner("err", t("errWrite") + e.message)); };
$("btnApplyPerf").onclick = () => { try { guard4k(); } catch { return; } applyPerf().catch(e => banner("err", t("errWrite") + e.message)); };
$("btnPair").onclick = async () => {
  try { guard4k(false); } catch { return; }   // 0x70 零负载
  if (!confirm(t("cfPair"))) return;
  try { await guarded(0x70, 0x00, null, { pace: 300 }); log("✓ pair cmd sent"); banner("ok", t("bPairSent")); await sleep(2000); await refreshAll(); }
  catch (e) { banner("err", e.message); }
};
/* 0x71 = Pair Default（恢复默认配对，零负载，官方发后等 300ms）
   0x72 = Get Pair Data（读取配对数据，官方等 350ms 后收，负载偏移 16 起 16 字节）
   —— 均来自官方 v1.02 工具逆向，见 re/PROTOCOL_NOTES.md */
$("btnPairDefault").onclick = async () => {
  try { guard4k(false); } catch { return; }
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
  try { guard4k(false); } catch { return; }   // 0x13 零负载，不需要先读配置
  if (!confirm(t("cfReset1"))) return;
  if (!confirm(t("cfReset2"))) return;
  try { await guarded(0x13, 0x00, null, { pace: resetSettle() }); log("✓ factory reset done"); await refreshAll(); banner("ok", t("bResetOk")); }
  catch (e) { banner("err", e.message); }
};
/* XM1 一键回退：把上一份快照（写入前 / 上一次读取）原样写回。
   快照之间的差异同样只落在已核实字段内，所以走的还是同一个白名单。 */
$("btnXm1Undo").onclick = async () => {
  if (S.xm1Snaps.length < 2) return banner("warn", t("xm1NoSnap"));
  const prev = S.xm1Snaps[S.xm1Snaps.length - 2];
  if (!window.confirm(t("xm1UndoConfirm").replace("{0}", new Date(prev.at).toLocaleTimeString()))) return;
  banner("warn", t("xm1Applying"));
  try {
    await writeBlobXm1(prev.blob);
    await readBlob();
    S.xm1Edit = xm1Parse(S.blob);
    render();
    S.xm1Snaps.pop();                        // 丢弃"当前"这一份，回到上一份
    banner("ok", t("xm1UndoOk"));
    log("✓ 已回退到快照（" + new Date(prev.at).toLocaleTimeString() + "，" + prev.label + "）");
  } catch (e) {
    banner("err", t("xm1WriteFail") + e.message);
    log("✗ 回退失败：" + e.message);
  }
};

$("btnSave").onclick = () => {
  if (!S.blob) return banner("err", t("cfgNoRead"));
  // 附带可读的 hex dump，便于人工比对与差分分析
  const hexLines = [];
  for (let o = 0; o < S.blob.length; o += 16) {
    const row = [];
    for (let i = 0; i < 16 && o + i < S.blob.length; i++) row.push(S.blob[o + i].toString(16).padStart(2, "0"));
    hexLines.push(o.toString(16).padStart(4, "0") + ": " + row.join(" "));
  }
  const out = { app: "endgame-gear-web-configurator", savedAt: new Date().toISOString(),
                device: S.mouseName, gen: S.gen, lang: LANG,
                blobB64: btoa(String.fromCharCode(...S.blob)),
                blobHex: hexLines.join("\n") };
  download(JSON.stringify(out, null, 2), `egg-mouse-config-${Date.now()}.json`, "application/json");
};
/* XM1 原样写回测试：发送的每个字节都必须等于刚读回的那份（白名单强制）。
   成功后再读一次比对 —— 一致即说明「读=写同一套布局」闭环成立。 */
$("btnXm1Echo").onclick = async () => {
  if (!S.xm1LastRead) return banner("err", t("bRead"));
  if (!window.confirm(t("xm1EchoConfirm"))) return;
  const before = S.xm1LastRead.slice();
  banner("warn", t("xm1EchoRunning"));
  log(`⋯ 回声写回测试：将原样写回 ${before.length} 字节（内容 = 刚读回的那份）`);
  try {
    await writeBlobXm1();
    log("✓ 回声写回已发送，正在回读比对…");
    await readBlob();
    const same = !!S.blob && S.blob.length === before.length && S.blob.every((v, i) => v === before[i]);
    if (same) { banner("ok", t("xm1EchoOk")); log("✓ 回读与写前逐字节一致 —— 布局闭环成立，可以进入下一步"); }
    else { banner("warn", t("xm1EchoDiff")); log(`⋯ 回读与写前不同：${hex(S.blob, 32)}`); }
  } catch (e) {
    banner("err", t("xm1EchoFail") + e.message);
    log("✗ 回声写回失败：" + e.message);
  }
};

$("btnBlob").onclick = () => { if (S.blob) download(new Blob([S.blob]), `egg-mouse-blob-${Date.now()}.bin`); };
$("btnLoad").onclick = () => $("fileLoad").click();
$("fileLoad").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  /* ★ 导入配置同样是写入（0x14 + 0x15 + 0x16×2），必须过同一道闸门。
     此前这里没有 guard4k() —— 单靠按钮 disabled 是不设防的：
     只要 handler 能被触发（旧文件选择器、脚本调用），只读型号就会被写。 */
  try { guard4k(); } catch { e.target.value = ""; return; }
  /* 8k 的写是整块写：导入一个来自别的型号的 blob 等于把未知偏移整体覆盖 ——
     这正是 XM1 事故的形态。故 8k 暂不支持导入（导出不受影响）。 */
  if (S.eightK) { banner("err", t("b8kNoImport")); e.target.value = ""; return; }
  try {
    const j = JSON.parse(await f.text());
    const b = Uint8Array.from(atob(j.blobB64), c => c.charCodeAt(0));
    if (b.length !== 1024) throw new Error("blob length != 1024");
    S.blob = b; parseBlob();
    S.stage.slamclick = !!(S.stage.flags & 1);
    S.stage.jitter = !!(S.stage.flags & 0x10);
    S.stage.multiclick = !!(S.stage.flags & 0x20);
    S.stage.maxFps = !!(S.stage.flags & 0x40);
    const wantSensor = snapSensor(), wantPerf = snapPerf(), wantBtns = snapButtons();
    await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
    await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
    for (let chunk = 1; chunk <= 2; chunk++) {
      const p = new Uint8Array(28);
      for (let i = 0; i < 4; i++) {
        const btn = S.stage.buttons[(chunk - 1) * 4 + i];
        p[i*7] = btn.type; p[i*7+1] = btn.code; p[i*7+2] = btn.key; p[i*7+6] = btn.filter;
      }
      await guarded(0x16, 0x0F, p, { chunk, pace: writeSettle() });
    }
    log("✓ config restored (0x14 + 0x15 + 0x16×2)");
    await refreshAll();
    const bad = [...verifySensor(wantSensor), ...verifyPerf(wantPerf), ...verifyButtons(wantBtns)];
    reportVerify("bImportOk", bad);
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

/* ================= 主题切换 =================
   颜色全部走 CSS 自定义属性（scss/_tokens.scss 的 $theme-light / $theme-dark），
   组件样式一行不改 —— 这里只切 <html data-theme>。首帧主题由模板 <head> 里的
   内联脚本提前设好，避免闪白。 */
function applyThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const b = $("btnTheme");
  if (!b) return;
  b.textContent = t(dark ? "themeDark" : "themeLight");
  b.title = t("themeTip");
}
$("btnTheme").onclick = () => {
  const dark = document.documentElement.dataset.theme === "dark";
  if (dark) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = "dark";
  try { localStorage.setItem("egg-theme", dark ? "light" : "dark"); } catch (e) { /* 隐私模式忽略 */ }
  applyThemeButton();
};
document.addEventListener("langchange", applyThemeButton);
applyThemeButton();

applyI18n();   // ★ 必须先跑：它会按 data-i18n 写文本，跑在布局之后会覆盖型号专属表头

/* 未连接状态：设备相关卡片全部收起（确定性初始态，不依赖模板里的 inline style）。
   若 URL 带 #layout=xxx 则套用该预览布局（便于无实机时查看裁剪效果）。 */
if (!applyLayoutFromHash()) applyLayout("none");
log("ℹ ready. Click 'Connect' and pick the Endgame Gear mouse / dongle.");
if (!("hid" in navigator))
  banner("warn", LANG === "zh-CN"
    ? "此环境没有 WebHID：内置预览/iframe/Firefox 都不支持。请把这个 index.html 下载到本地，用 Chrome 或 Edge 直接打开。"
    : "No WebHID here: embedded previews/iframes/Firefox are not supported. Download index.html and open it directly in Chrome or Edge.");
else
  log("✓ WebHID available (" + navigator.userAgent.match(/(Edg|Chrome)\/[\d.]+/)?.[0] + ")");