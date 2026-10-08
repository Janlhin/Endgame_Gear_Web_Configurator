// 设备在位监测与「复位到初始界面」的离线回归。
//
// 由来：设备拔掉/断电后，页面原本仍显示「已连接 + 旧数据」，看起来正常但写入必然失败 ——
//   这种「僵住的界面」比报错更糟。于是加了 src/presence.ts：disconnect 事件 + 定时清点
//   navigator.hid.getDevices() 两条信号，命中就把状态与界面复位到初始态。
//
// 这里覆盖三件在无实机时也能验证、且**最容易写错**的事：
//   ① resetToInitial() 是否真的清了状态与界面（包括 guard4k 依赖的 S.blob）
//   ② 清点的判定阈值：一次落空不判定、连续两次才判定、opened===false 一次即判定
//   ③ 两条「不该误判」的反例：从没在位过（#layout= 预览）、getDevices 拿不到列表、后台标签页
import { el, fire, setDevices } from "./_domstub.js";
import { resetToInitial, watchPresence, watchDisconnect } from "../src/presence.js";
import { S } from "../src/state.js";
import { t } from "../src/i18n.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};
const tick = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

/* 与 layout.ts 的 ALL_CARDS 对应（那里没有导出，测试这一份是按定义抄的）。 */
const ALL_CARDS = ["cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools",
                   "cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"];

console.log("[1] resetToInitial：状态与界面都回到「未连接」");
{
  /* 造出「上一台设备」的全部残留 —— 复位必须把它清干净 */
  S.dev = { productName: "XM2w 4k v2", vendorId: 0x3367, productId: 0x1970, opened: true };
  S.mouseName = "XM2w 4k v2"; S.gen = 2;
  S.eightK = true; S.xm1 = false; S.family4 = false; S.wired = true;
  S.unverified = true; S.unknownModel = true;
  S.blob = new Uint8Array(1024); S.lastFrame = new Uint8Array(1041); S.frameAligned = true;
  S.dongleFw = "1.2"; S.mouseFw = "2.3"; S.battery = 88;
  S.stage.cpi[0][1] = 1600; S.stage.levels = 2; S.stage.active = 3;
  S.xm1LastRead = new Uint8Array(1024); S.xm1Armed = true; S.xm1Edit = { stages: [] };
  S.xm1Snaps.push({ at: 1, label: "snap", blob: new Uint8Array(1) });
  S.lastFail = true;

  el("iModel").textContent = "XM2w 4k v2"; el("iBattery").textContent = "88 %";
  el("cpiRows").innerHTML = "<tr><td>x</td></tr>";
  el("btnRows").innerHTML = "<tr></tr>"; el("filterRows").innerHTML = "<tr></tr>";
  el("weCpiRows").innerHTML = "<tr></tr>"; el("weBtnRows").innerHTML = "<tr></tr>";
  el("cpiStepNote").textContent = "note";
  el("cpiActiveNote").textContent = "note"; el("pollNote").textContent = "note";
  el("connState").className = "status-pill"; el("connState").textContent = "已连接（无线）";
  el("btnRefresh").disabled = false;
  el("btnXm1Echo").style.display = ""; el("btnXm1Undo").style.display = "";
  el("banner").className = "banner ok"; el("banner").textContent = "已读取当前配置。";

  resetToInitial("devLost", "XM2w 4k v2");

  ok(S.dev === null, "S.dev 置空");
  ok(S.mouseName === "—" && S.gen === null, "型号 / 代数复位");
  ok(!S.eightK && !S.xm1 && !S.family4 && !S.wired && !S.unverified && !S.unknownModel, "族标志位全部复位");
  ok(S.blob === null, "S.blob 清空（guard4k 据此判断「读到过配置」，不清会让写入闸门误放行）");
  ok(S.lastFrame === null && S.frameAligned === false, "8k 的帧缓存清空");
  ok(S.dongleFw === "—" && S.mouseFw === "—" && S.battery === null, "固件 / 电量复位");
  ok(S.xm1LastRead === null && S.xm1Armed === false && S.xm1Edit === null, "XM1 回声写回的凭据清空");
  ok(S.xm1Snaps.length === 0, "XM1 快照清空");
  ok(S.lastFail === false, "传输层失败标志复位");
  ok(S.stage.cpi[0][1] === 400 && S.stage.levels === 4 && S.stage.active === 1,
     "界面模型回到出厂默认（否则会把旧值当成设备当前值下发）");

  ok(el("iModel").textContent === "—" && el("iBattery").textContent === "—", "设备信息清空");
  ok(el("cpiRows").innerHTML === "" && el("btnRows").innerHTML === "" && el("filterRows").innerHTML === "",
     "CPI / 按键 / 过滤行清空");
  ok(el("weCpiRows").innerHTML === "" && el("weBtnRows").innerHTML === "", "XM2we 的行也清空");
  ok(el("cpiStepNote").textContent === "" && el("cpiActiveNote").textContent === "" && el("pollNote").textContent === "",
     "说明文字清空");
  ok(el("btnRefresh").disabled === true, "「重新读取」已禁用");
  ok(/status-pill/.test(el("connState").className) && /off/.test(el("connState").className)
     && el("connState").textContent === t("notConnected"), "状态胶囊回到「未连接」");
  ok(el("banner").textContent === t("devLost") && /err/.test(el("banner").className), "横幅用 err 样式告知断开");
  ok(el("btnXm1Echo").style.display === "none" && el("btnXm1Undo").style.display === "none",
     "XM1 实验按钮收起（否则换到 4k 族后它们会一直留在工具卡片里）");
  ok(ALL_CARDS.every(c => el(c).style.display === "none"), "全部设备卡片收起（回到初始界面）");
}

console.log("[2] disconnect 事件：一次触发即复位");
{
  const lost: string[] = [];
  const handlers: Function[] = [];
  const dev = { productName: "XM2w 4k", addEventListener(_t: string, f: Function) { handlers.push(f); } };
  watchDisconnect(dev, r => lost.push(r));
  ok(handlers.length === 1, "已在设备上挂上 disconnect 监听");
  handlers[0]({ type: "disconnect" });
  ok(lost.length === 1 && lost[0] === "devLost", "事件触发 → onLost('devLost')");
}

console.log("[3] 在位清点：一次落空不判定，连续两次才判定");
{
  const lost: string[] = [];
  const dev: any = { productName: "XM2w 4k", opened: true };
  setDevices([dev]);
  watchPresence("t-threshold", () => dev, r => lost.push(r));
  fire("visibilitychange"); await tick();
  ok(lost.length === 0, "在位：不判定");
  setDevices([]);
  fire("visibilitychange"); await tick();
  ok(lost.length === 0, "第 1 次落空：不判定（容忍抖动）");
  fire("visibilitychange"); await tick();
  ok(lost.length === 1 && lost[0] === "devGone", "连续 2 次落空：判定丢失");
  setDevices([]);
}

console.log("[4] opened===false（浏览器已关闭接口）→ 一次即判定");
{
  const lost: string[] = [];
  const dev: any = { productName: "XM1", opened: true };
  setDevices([dev]);
  watchPresence("t-closed", () => dev, r => lost.push(r));
  fire("visibilitychange"); await tick();
  ok(lost.length === 0, "在位：不判定");
  dev.opened = false;
  fire("visibilitychange"); await tick();
  ok(lost.length === 1, "接口已关闭：不必等第二次清点");
}

console.log("[5] 不该误判的三种情况");
{
  /* ① 从没在位过 —— #layout= 预览布局下并没有设备，绝不能因此复位 */
  const lost1: string[] = [];
  const dev1: any = { productName: "preview", opened: true };
  setDevices([]);
  watchPresence("t-preview", () => dev1, r => lost1.push(r));
  for (let i = 0; i < 5; i++) { fire("visibilitychange"); await tick(); }
  ok(lost1.length === 0, "从未观察到在位（#layout= 预览）→ 永不判定丢失");

  /* ② getDevices 拿不到列表（权限抖动 / 实现差异）→ 不据此判定 */
  const lost2: string[] = [];
  const dev2: any = { productName: "X", opened: true };
  setDevices([dev2]);
  watchPresence("t-nolist", () => dev2, r => lost2.push(r));
  fire("visibilitychange"); await tick();
  setDevices(null);
  for (let i = 0; i < 4; i++) { fire("visibilitychange"); await tick(); }
  ok(lost2.length === 0, "getDevices 失败 → 不做判定（交给 disconnect 事件）");

  /* ③ 后台标签页不查；回到前台补查 */
  const lost3: string[] = [];
  const dev3: any = { productName: "Y", opened: true };
  setDevices([dev3]);
  watchPresence("t-hidden", () => dev3, r => lost3.push(r));
  fire("visibilitychange"); await tick();
  setDevices([]);
  (document as any).visibilityState = "hidden";
  for (let i = 0; i < 4; i++) { fire("visibilitychange"); await tick(); }
  ok(lost3.length === 0, "后台标签页不查");
  (document as any).visibilityState = "visible";
  fire("visibilitychange"); await tick(); fire("visibilitychange"); await tick();
  ok(lost3.length === 1, "回到前台补查 → 判定丢失");
  setDevices([]);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
process.exit(0);
