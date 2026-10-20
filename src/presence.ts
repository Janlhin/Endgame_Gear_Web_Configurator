import { errMsg } from "./err.js";
/** 设备在位监测：设备一旦「不在了」，界面自动回到初始态（未连接）。
 *
 *  为什么需要：设备拔掉/断电之后，页面原本仍显示着旧数据与「已连接」，
 *  看起来一切正常，但任何写入都会失败。这种「僵住的界面」比直接报错更糟 ——
 *  用户会以为改动生效了。所以检测到设备不在位就整体复位，把话说清楚。
 *
 *  三层信号，从可靠到兜底：
 *    ① HIDDevice 的 `disconnect` 事件 —— 拔线/断电时浏览器直接触发，最准、立即
 *    ② 定时清点 navigator.hid.getDevices() —— 个别平台/接收器不触发 ① 时兜底
 *    ③ 页面重新可见时补查一次 —— 后台标签页的定时器会被浏览器节流（回到前台补一次）
 *
 *  ★ 刻意**不**用「发探测命令」判断在位，两个原因都是实测结论：
 *      · 0x0F 是无线**唤醒**命令（re/PROTOCOL_NOTES.md），定时发会让鼠标永不深睡（费电）；
 *      · 0x0E / 0x07 在鼠标睡着时回 unreachable，会把「睡着了」误判成「没了」。
 *    getDevices() 是纯查询，不碰设备，代价为零。
 *  ★ 「无线链路断开」（inputreport 0xB1 = 0）**不算**设备丢失 —— 接收器还在，
 *    鼠标只是睡了，动一下就能继续用。这个区分很重要：否则每次休眠都踢回初始界面。
 *  ★ 清点可能因权限/浏览器抖动误报，故要求**连续两次**落空才判定丢失；
 *    但 `opened === false`（浏览器已关掉该接口）是硬证据，一次即判定。
 *
 *  与 layout.ts 的 #layout= 预览共存的注意点：预览布局下并没有设备，
 *  因此「从没在位过」的位永远不会被判丢失（见 Target.seen）。
 */
import { $, $el, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S, newStage } from "./state.js";
import { applyLayout } from "./layout.js";
import { setConn } from "./render.js";

const SWEEP_MS = 5000;   // 清点间隔
const MISSES = 2;        // 连续落空多少次判定丢失

/** 复位时用到的文案键。全部是字典里的键，由 re/i18n_audit.mjs 校验存在性。 */
export type LostReason = "devLost" | "devGone" | "devReleased";

/* ---------------- 回到初始界面 ---------------- */

/** 把界面与状态整体复位到「未连接」的初始态。
 *
 *  ★ 这里不做任何设备 I/O —— 设备已经没了，能做的只有把界面说清楚、把残留数据清掉。
 *  ★ 清状态不只是「好看」：guard4k() 判断「是否读到过配置」只看 S.blob / S.gen，
 *    断线后把这些留着，等于让写入闸门以为「读过了」而放行 —— 这正是 2026-10-09
 *    那次事故的同类错误（不知道设备当前值就下发）。所以这一段别删。
 *  detail 只进日志（可能是未翻译的型号名），不进横幅 —— 横幅要能被翻译。 */
export function resetToInitial(reasonKey: LostReason, detail?: string) {
  /* 1) 清共享状态。放在清界面之前：applyLayout 之后可能触发渲染，
        渲染读到半清的状态没有意义。 */
  S.dev = null;
  S.mouseName = "—"; S.gen = null;
  S.eightK = false; S.xm1 = false; S.family4 = false; S.wired = false;
  S.unverified = false; S.unknownModel = false;
  S.betaArmed = false;   // 实验写入许可只属本次连接，换设备/断开一律收回
  S.blob = null; S.lastFrame = null; S.frameAligned = false;
  S.dongleFw = "—"; S.mouseFw = "—"; S.battery = null;
  S.stage = newStage();
  S.xm1LastRead = null; S.xm1Armed = false; S.xm1Edit = null; S.xm1Snaps = [];
  S.lastFail = false;
  S.writing = false;   // 写入互斥必须随设备丢失一起复位，否则界面会永远"忙"

  /* 2) 收起全部设备卡片（applyLayout 是白名单式，一次设置全部）*/
  applyLayout("none");
  setConn(false, t("notConnected"));
  const rf = $el<HTMLButtonElement>("btnRefresh");
  if (rf) rf.disabled = true;

  /* 3) 抹掉可能残留的数据行 / 数值 —— 卡片虽然收起了，但若将来某个入口
        又把它显示出来（例如 #layout= 预览），不该看到上一台设备的数据。 */
  /* filterRows 已随「两张表合并为一张」从 DOM 移除（#cardBtns 现在只有 btnRows）。 */
  for (const id of ["cpiRows", "btnRows", "weCpiRows", "weBtnRows"]) {
    const el = $(id); if (el) el.innerHTML = "";
  }
  for (const id of ["iModel", "iMouseFw", "iDongleFw", "iBattery", "iConn", "iGen",
                    "weModel", "weConn", "weBattery", "weLink"]) {
    const el = $(id); if (el) el.textContent = "—";
  }
  for (const id of ["cpiStepNote", "cpiActiveNote", "pollNote"]) {
    const el = $(id); if (el) el.textContent = "";
  }
  /* XM1 专属的两个按钮不在 layout 的登记表里（它们在 cardTools 内，由 renderXm1 直接
     改 display）。不复位的话，从 XM1 换到 4k 族之后它们会一直留在工具卡片里。 */
  for (const id of ["btnXm1Echo", "btnXm1Undo"]) {
    const el = $(id); if (el) el.style.display = "none";
  }

  /* 4) 告知用户，并回到页面顶部 —— 「弹出到最初的界面」的字面含义。 */
  banner("err", t(reasonKey));
  log("✗ " + t(reasonKey) + (detail ? "（" + detail + "）" : ""));
  try { window.scrollTo({ top: 0 }); } catch (e) { /* 老环境可能不支持对象参数 */ }
}

/* ---------------- 在位清点 ---------------- */

/** 一个「设备位」：怎么取到当前设备，以及丢了之后干什么。 */
type Target = {
  device: () => any;
  onLost: (reason: LostReason) => void;
  seen: boolean;    // 是否曾观察到在位（预览布局下永远为 false）
  miss: number;     // 连续落空次数
};

const targets = new Map<string, Target>();
let timer: any = null;

/** 登记一个设备位。id 只用于日志。 */
export function watchPresence(id: string, device: () => any, onLost: (reason: LostReason) => void) {
  targets.set(id, { device, onLost, seen: false, miss: 0 });
  if (timer === null) timer = setInterval(() => { void sweep(); }, SWEEP_MS);
}

/** 直接给一个已打开的 HIDDevice 挂 disconnect 监听（最可靠的那一层）。
 *  也接受 navigator.hid，两种情况都在同一天被触发：设备级是精确到接口的，
 *  浏览器级是全局的 —— 这里只用设备级，避免同一事件触发两次复位。 */
export function watchDisconnect(d: any, onLost: (reason: LostReason) => void) {
  try {
    d.addEventListener("disconnect", () => {
      log(`⋯ 浏览器报告设备已断开：${d.productName ?? "?"}`);
      onLost("devLost");
    });
  } catch (e) {
    /* 极老的实现没有该事件 —— 交给定时清点兜底 */
    log("⋯ 无法监听 disconnect 事件（" + errMsg(e) + "），改由清点检测");
  }
}

/** 取浏览器当前认得的设备列表。拿不到就返回 null —— 此时**不**据此判定，
 *  否则一次权限抖动会把正常连接误判成丢失。 */
async function deviceList(): Promise<any[] | null> {
  const hid: any = (navigator as any).hid;
  if (!hid || typeof hid.getDevices !== "function") return null;
  try { return await hid.getDevices(); } catch (e) { log("⋯ getDevices 失败：" + errMsg(e)); return null; }
}

/** 同一个设备的判断：优先对象身份，退化为三元组匹配（浏览器可能返回新对象）。 */
function sameDevice(a: any, b: any): boolean {
  if (a === b) return true;
  return a.vendorId === b.vendorId && a.productId === b.productId && a.productName === b.productName;
}

function markLost(id: string, tg: Target, why: string) {
  tg.seen = false; tg.miss = 0;
  log(`✗ 设备已不在位（${id}）：${why}`);
  tg.onLost("devGone");
}

async function sweep() {
  if (!targets.size) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;  // 后台不查
  const list = await deviceList();
  for (const [id, tg] of targets) {
    const d = tg.device();
    if (!d) { tg.seen = false; tg.miss = 0; continue; }
    /* 接口已被浏览器关闭 → 硬证据，不必等第二次清点 */
    if (d.opened === false) { markLost(id, tg, "接口已关闭"); continue; }
    if (!list) { tg.seen = true; continue; }
    if (list.some(x => sameDevice(x, d))) { tg.seen = true; tg.miss = 0; continue; }
    if (!tg.seen) continue;                 // 从没在位过（#layout= 预览）→ 不管
    tg.miss++;
    log(`⋯ 设备清点未命中（${id}）：${tg.miss}/${MISSES} — ${d.productName ?? "?"}`);
    if (tg.miss >= MISSES) markLost(id, tg, `连续 ${MISSES} 次清点落空`);
  }
}

/* 回到前台时补查一次：后台标签页的 setInterval 会被浏览器节流到分钟级，
   而用户最可能就是在切走再切回来之后才发现设备已经不在了。 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sweep();
  });
}
