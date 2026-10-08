// 应用主体：全局状态 / 传输层 / blob 读写解析 / UI 渲染 / 连接与事件绑定
import { $, sleep, hex, log, banner } from "./util.js";
import { LANG, t, applyI18n } from "./i18n.js";
import { VID, VID_22D4, DONGLE_PID, MOUSE_PIDS, RPT_CMD, RPT_BULK,
         XM1_MAX_STAGES, XM1_SETTLE_MS, isXm1, modelOf,
         buildXm1BlobReport, buildXm1ByteReport,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte } from "./protocol.js";
import { isXm2weFamily } from "./xm2we.js";
import { openXm2we, closeXm2we, refreshWe, bindXm2weUI, isXm2weOpen } from "./xm2we-ui.js";

// —— 语言切换时重渲染（i18n.ts 通过事件解耦） ——
document.addEventListener("langchange", () => render());

const STAGE_COLORS = { "zh-CN": ["蓝", "绿", "黄", "红"], "en": ["Blue", "Green", "Yellow", "Red"] };
const BTN_NAMES = { "zh-CN": ["左键", "右键", "中键", "后退", "前进", "特殊(CPI)", "滚轮上", "滚轮下"],
                    "en": ["Left", "Right", "Middle", "Back", "Forward", "Special (CPI)", "Wheel up", "Wheel down"] };
const FILTER_OPTS = [["off","off"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"],["9","9"],["10","10"],["11","11"],["12","12"],["13","13"],["14","14"],["15","15"]];


let dev = null, queue = Promise.resolve(), lastFail = false;
let gen = null, mouseName = "—";
let unverified = false;   // 该型号仅静态实证、未真机验证 → 只读
let blob = null;
let dongleFw = "—", mouseFw = "—", battery = null, wired = false;
/* XM1（VID 0x22D4）是 2020 变体：帧格式与 4k 族相同，但
   ① 状态字节在 [1]（0x01 = 成功，与 4k 同）② 无独立唤醒命令（0x0F 是 4k 无线专属）
   ③ 4 档 CPI ④ 写后 settle 80ms。证据见 re/XM1_NOTES.md 第 3 / 6.7 节。 */
let xm1 = false;
/* ★ XM1 写入的两道闸门（2026-10-09）
   xm1LastRead：最近一次成功读回的线上布局 1024B —— 写入只允许「回声」这份数据。
   xm1Armed   ：是否处于一次明确的写回测试中；非 arm 状态下一律拦截。 */
let xm1LastRead: Uint8Array | null = null;
let xm1Armed = false;
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
async function rawReceive(reportId, size?: number) {
  /* WebHID 的 receiveFeatureReport(reportId) 用 reportId 定位报告。
     ★ XM1 的 1041B 报告首字节是 **0xA1**，不是 0xA0！
       官方 0x40FC80：memset(1041B,0) / mov byte [buf], 0xA1 /
       push 0x411 / push buf / call HidD_GetFeature
       即 GetFeature 的 reportId 取自**缓冲区首字节** = 0xA1。
       （曾误传 0xA0 → 设备把空请求原样回显，日志里全是 0x00。）
     size：某些实现需要显式长度，XM1 走 1041B 时传它。 */
  const d = size !== undefined ? await dev.receiveFeatureReport(reportId, size)
                               : await dev.receiveFeatureReport(reportId);
  let u8 = new Uint8Array(d.buffer);
  if (u8.length && u8[0] === 0x00) u8 = u8.slice(1);              // 零占位 → 丢弃
  if (u8.length && u8[0] === reportId) return u8;                 // 已含 reportId
  const out = new Uint8Array(u8.length + 1); out[0] = reportId; out.set(u8, 1); return out;
}
async function transact(cmd, target = 0x00, payload = null, opt: any = {}) {
  /* XM1 不走 4k 族的命令通道：它的命令表只有 4 条，报文形态也完全不同
     （读 = 0xA1 空请求 + GetFeature 读回，见 readBlobXm1）。
     4k 的 13 条命令若发给 XM1 会被当作乱码配置，故一律拒绝。
     另：2026-10-09 事故记录见 readBlobXm1 上方注释——曾因发送 1041B
     全零 blob（写形态）把用户鼠标的 DPI/CPI 清零。 */
  if (xm1) xm1WriteDisabled();
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
   （zexsso/OP1-WebAPP device.ts 真机验证）。有线直接走 0x0E 读鼠标信息。
   XM1 的命令表只有 4 条（0x03/0x04/0x07/0x08），**没有 0x0E/0x0F**，
   故 XM1 跳过探测直接读 blob。 */
async function probe() {
  if (xm1) return;                       // XM1 无探测命令
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
         导致 v1 格式在 [1] 读到 0xA1 而误判"未备好"（此前误诊为时序问题，重试无效）。
   XM1（2020 变体）用命令 0x07 读 blob（4k 族用 0x12），状态字节在 [1]，blob 同样在偏移 16
   （官方函数 0x40FB90：mov dword [buf], 0x8A0 → 线上 A0 08 00 00，rep movsd 1024B）。
   由于 XM1 的 blob 字段语义尚未逐字段核实（重排层 0x40FD60 待解），
   这里只做宽松校验并把原始 blob 原样保留，便于真机比对。 */
function looksLikeBlob(b: Uint8Array, isXm1Dev = false) {
  if (isXm1Dev) {
    // XM1 无已知语义锚点，只排除全 0 / 全 FF 这两类明显无效
    let nonZero = 0, nonFF = 0;
    for (let i = 0; i < b.length; i++) { if (b[i] !== 0) nonZero++; if (b[i] !== 0xFF) nonFF++; }
    return nonZero > 16 && nonFF > 16;
  }
  return (b[0x0E] >= 1 && b[0x0E] <= 4) && [0x02, 0x04, 0x08, 0x40, 0x80].includes(b[0x05]);
}
async function readBlob() {
  let lastDump = "";
  /* XM1 走**完全不同的路径**（官方函数 0x40FB90，反汇编实证）：
       memset(buf,0,0x411)              1041B 大报告
       mov dword [buf], 0x8A0           线上 A0 08 00 00
       buf[4]=0  buf[5]=子命令  buf[6..7]=0
       rep movsd (256 dword = 1024B)    blob → 报告偏移 16
       SetFeature(1041) → Sleep(80) → 再读一次 64B 状态报告
     所以它**不经过小报告命令通道**（没有"发 cmd → 读 status"这一轮），
     之前用 guarded(0x08) 走 transact 是错的 —— 那条路会撞上 4k 的状态字节判定。 */
  if (xm1) return readBlobXm1();

  for (let round = 1; round <= 4; round++) {
    await guarded(0x12, 0x00, null, { pace: 250 });
    for (let i = 0; i < 3; i++) {
      let u8;
      try { u8 = await rawReceive(RPT_BULK); }
      catch (e) { log(`✗ 读 0xA0 失败: ${e.message}`); await sleep(120); continue; }
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
    await sleep(xm1 ? 200 : 300);
  }
  throw new Error(`blob read failed after 4 rounds; last head: ${lastDump}`);
}

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
function xm1QueryReq(cmd: number) {
  const b = new Uint8Array(63);
  b[0] = cmd;
  return b;
}
const XM1_READ_REQ = xm1QueryReq(0x07);

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
async function xm1QueryByte() {
  try {
    await dev.sendFeatureReport(RPT_CMD, xm1QueryReq(0x03));
  } catch (e) {
    log(`✗ XM1 cmd 0x03 发送失败: ${e.message}`);
    return null;
  }
  await sleep(50);                     // 官方 Sleep(0x32)
  /* 响应报告的 ID 未确证：blob 读用的是 0xA0（实测），单字节读先用 0xA0 再退到 0xA1。
     两者都是**只读**调用，失败只会抛异常，不会改设备。 */
  for (const rid of [RPT_BULK, RPT_CMD]) {
    try {
      const u8 = await rawReceive(rid);
      log(`  XM1 cmd 0x03 响应 (reportId 0x${rid.toString(16)}) ${u8.length} B  head: ${hex(u8, 32)}`);
      return u8;
    } catch (e) {
      log(`  XM1 cmd 0x03 用 reportId 0x${rid.toString(16)} 读取失败: ${e.message}`);
    }
  }
  return null;
}

async function readBlobXm1() {
  let lastDump = "";
  for (let round = 1; round <= 4; round++) {
    // ① 发 64B 空请求（无负载，不改动鼠标任何配置）
    try {
      await dev.sendFeatureReport(RPT_CMD, XM1_READ_REQ);
    } catch (e) {
      log(`✗ XM1 空请求失败 (round ${round}): ${e.message}`);
      lastDump = "send:" + e.message;
      await sleep(300);
      continue;
    }
    await sleep(XM1_SETTLE_MS);          // 官方 Sleep(80)
    /* ② 读取响应：reportId = **0xA0**（设备的 1041B 报告 ID）。
       实证反推：日志出现 `a1 a0 01 00 …`
         → 设备真实返回 [0xA0, 0x01, 0x00, …]
             [0]=0xA0 报告 ID，[1]=0x01 状态（读取成功）
         → 用 0xA1 请求时 rawReceive 多补一字节，整体右移一格才得到 a1 a0 01
       所以这里必须用 RPT_BULK(0xA0)：u8[0] === reportId 命中，rawReceive 不补位，
         u8[1] 才是真正的状态字节，blob 在偏移 16。
       （这与 4k 族读 0xA0 大报告的写法一致。） */
    let u8;
    try { u8 = await rawReceive(RPT_BULK); }
    catch (e) {
      log(`✗ XM1 GetFeature(0xA0) 失败 (round ${round}): ${e.message}`);
      lastDump = "recv:" + e.message;
      await sleep(250);
      continue;
    }
    log(`  XM1 响应 ${u8.length} B  head: ${hex(u8, 24)}`);
    // ③ 状态判定（官方：cmp byte [buf+1], 1）
    if (u8[1] !== 0x01) {
      lastDump = hex(u8, 32);
      log(`⋯ XM1 状态未就绪 ([1]=0x${u8[1].toString(16)}), round ${round}, head: ${lastDump}`);
      await sleep(300);
      continue;
    }
    // ④ blob 在报告偏移 16
    const off = 16;
    if (u8.length < off + 1024) {
      lastDump = hex(u8, 32);
      log(`⋯ XM1 响应长度不足 (${u8.length} B, 需 ≥${off + 1024}), round ${round}, head: ${lastDump}`);
      await sleep(300);
      continue;
    }
    const cand = u8.slice(off, off + 1024);
    if (looksLikeBlob(cand, true)) {
      blob = cand;
      xm1LastRead = cand.slice();          // 写入只能「回声」这一份（逐字节相等校验）
      lastFail = false;
      log(`✓ XM1 blob read OK (${blob.length} B @off ${off}, round ${round})  head: ${hex(blob, 32)}`);
      return;
    }
    lastDump = hex(cand, 32);
    log(`⋯ XM1 blob 校验未过, round ${round}, head: ${lastDump}`);
    await sleep(300);
  }
  lastFail = true;
  throw new Error("XM1 blob read failed after 4 rounds; last: " + lastDump);
}

/** XM1 写入仍未实现：0x4103D0 重排层未逐字节核实，保持永久停用。 */
function xm1WriteDisabled(): never {
  banner("warn", t("xm1WriteOff"));
  throw new Error(t("xm1Blocked") + " (re/XM1_NOTES.md 6.5 / 6.13)");
}

/* ================= blob 解析 / 编码 ================= */
function parseBlob() {
  const b = blob; const s: any = newS();

  /* XM1（VID 0x22D4）：blob 布局与 4k 族同构，但字段语义**尚未逐字节核实**
     ——官方内部布局与线上布局之间还有一层重排（函数 0x40FD60，298 条搬运）。
     因此这里只做「不猜」的解析：把原始字节整体带出，供界面显示与导出对照，
     绝不按 4k 的偏移猜测并回写（写错会永久损坏鼠标配置）。 */
  if (xm1) {
    s.raw = b;
    s.levels = XM1_MAX_STAGES;                 // XM1 为 4 档（官方 UI 有 4 张 CPI 卡片）
    s.active = 1;
    s.unknown = true;                          // 标记：UI 应转为只读视图
    stage = s;
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
const XM1_F = {
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
const XM1_STAGE_ON = 0x00;
/** Lift Cut-Off 编码 ⇄ 毫米（实测 3mm=11、2mm=6 ⇒ 5×mm−4） */
const xm1LodToMm = (raw) => raw ? (raw + 4) / 5 : 0;
const xm1MmToLod = (mm) => Math.round(mm * 5) - 4;

function xm1Parse(b) {
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

/* ---------------- XM1 写入：**只允许原样回声** ----------------
 * 官方写事务（0x41A070，2026-10-09 反汇编确证）：
 *   cmd 0x03 读单字节（握手，返回值只用来判成败，数据不用）
 *   0x40E0D0 打包对象 → 0x40FB90 写 blob
 *     报告 = 1041B：A0 08 00 00 | buf[4]=0 | buf[5]=入参 | buf[6..7]=0 | 偏移16起 1024B
 *     写完 Sleep(80) → 再读 64B 确认
 *   cmd 0x04 写单字节（值 = 同一个入参）
 *
 * 那个入参来自 obj[4]，而 obj[4] 就是解析器读到的缓冲区第 0 字节
 *   （0x40E550: movzx eax, byte ptr [esi] / mov byte ptr [edi+4], al）
 * —— 也就是**我们每次读回来的 1024B 的第 0 字节**。没有任何未知量。
 *
 * 为什么可证明无损：
 *   官方写路径 memset(1024B,0) 后只填重排表 A 覆盖的 166 个字节，而三份真机快照的
 *   非零字节 100% 落在 A 的目的集内 → 把「刚读回来的那份」原样写回，设备侧状态不变。
 *   发送白名单会把这一点**逐字节强制校验**：载荷不等于刚读回的那份就直接拦截。
 */
async function writeBlobXm1(payloadIn?: Uint8Array) {
  const ref = xm1LastRead;
  if (!dev || !xm1) throw new Error("XM1 未连接");
  if (!ref || ref.length !== 1024) throw new Error("尚未成功读取过配置");
  if (lastFail) throw new Error("设备状态异常，请先重新读取");

  await xm1QueryByte();                                   // ① 握手（空载荷）

  const data = buildXm1BlobReport(payloadIn || ref);      // ② 写 blob（构造与校验同源）
  xm1Armed = true;
  try {
    await dev.sendFeatureReport(RPT_BULK, data);
    await sleep(XM1_SETTLE_MS);
    try { await rawReceive(RPT_CMD); } catch (e) { /* 官方的 64B 确认读，失败不致命 */ }
    await dev.sendFeatureReport(RPT_CMD, buildXm1ByteReport(ref[0]));   // ③ 写单字节 = blob[0]
    await sleep(XM1_SETTLE_MS);
  } finally {
    xm1Armed = false;                                     // 无论成败，立刻解除武装
  }
}

/* ================= XM1 编辑（受限）=================
 * 可写字节被 protocol.ts 的 xm1GuardWrite 硬限制在 23 个已核实偏移内 —— UI 只是
 * 表面，真正的边界在发送层。这里负责：编辑状态、打补丁、差异预览、写入前快照、
 * 写入后回读校验。 */
let xm1Edit: any = null;

/* 快照：每次成功读取、以及每次写入前各存一份，最多 20 份，支持一键回退。 */
const xm1Snaps: { at: number; label: string; blob: Uint8Array }[] = [];
function xm1Snapshot(label: string) {
  if (!xm1LastRead) return;
  const last = xm1Snaps[xm1Snaps.length - 1];
  if (last && last.blob.length === xm1LastRead.length && last.blob.every((v, i) => v === xm1LastRead![i])) return;
  xm1Snaps.push({ at: Date.now(), label, blob: xm1LastRead.slice() });
  if (xm1Snaps.length > 20) xm1Snaps.shift();
  const b = $("btnXm1Undo");
  if (b) b.textContent = t("xm1Undo") + " (" + xm1Snaps.length + ")";
}

/** 把编辑状态打成一份新的 1024B（只动 XM1_F 里登记的偏移）。 */
function xm1PatchEdit(ref: Uint8Array, e: any): Uint8Array {
  const out = ref.slice();
  const clamp = (v: number) => Math.max(50, Math.min(30000, Math.round(v / 50) * 50));
  out[XM1_F.active] = (e.active | 0) & 3;
  XM1_F.stages.forEach((st, i) => {
    const ed = e.stages[i];
    out[st.flag] = ed.on ? XM1_STAGE_ON : 0xFF;
    /* ★ XM1 的固件只读取 X，忽略 Y（2026-10-09 真机实测：改 X 有效果、改 Y 没效果）。
       协议层同样印证：XM1 每档是 [启用][填充][X][Y] 共 6 字节，**没有** 4k 族那样的
       XY 使能字段（4k 族是 0x23+5n 的 [XY使能][X][Y]）。
       所以写入时把 Y 也设成 X —— 与官方工具行为一致，且避免设备里残留一个
       "看似有效、实则无效"的 Y 值。 */
    const x = clamp(ed.x);
    out[st.x] = x & 0xFF; out[st.x + 1] = (x >> 8) & 0xFF;
    out[st.y] = x & 0xFF; out[st.y + 1] = (x >> 8) & 0xFF;
  });
  out[XM1_F.lod] = xm1MmToLod(e.lodMM);
  out[XM1_F.ripple] = e.ripple ? 1 : 0;
  return out;
}

/** 偏移 → 人话字段名（用于差异预览） */
function xm1FieldName(off: number): string {
  if (off === XM1_F.active) return t("xm1FActive");
  if (off === XM1_F.lod) return t("xm1FLod");
  if (off === XM1_F.ripple) return t("xm1FRipple");
  for (let i = 0; i < XM1_F.stages.length; i++) {
    const st = XM1_F.stages[i];
    if (off === st.flag) return "CPI " + (i + 1) + " " + t("on");
    if (off === st.x || off === st.x + 1) return "CPI " + (i + 1) + " X";
    if (off === st.y || off === st.y + 1) return "CPI " + (i + 1) + " Y (=X)";
  }
  return "?";
}

/** 应用编辑：差异预览 → 快照 → 写入 → 回读校验 */
async function xm1Apply() {
  if (!xm1LastRead || !xm1Edit) return banner("err", t("bRead"));
  const next = xm1PatchEdit(xm1LastRead, xm1Edit);
  const diffs: number[] = [];
  for (let i = 0; i < 1024; i++) if (next[i] !== xm1LastRead[i]) diffs.push(i);
  if (!diffs.length) return banner("warn", t("xm1NoChange"));

  const lines = diffs.map(o => "  0x" + o.toString(16).padStart(3, "0") + "  " +
    xm1FieldName(o) + "   " + xm1LastRead[o].toString(16).padStart(2, "0") + " → " +
    next[o].toString(16).padStart(2, "0")).join("\n");
  if (!window.confirm(t("xm1ApplyConfirm").replace("{0}", String(diffs.length)) + "\n\n" + lines)) return;

  xm1Snapshot(t("xm1SnapBeforeWrite"));
  banner("warn", t("xm1Applying"));
  try {
    await writeBlobXm1(next);
    await readBlob();
    // 回读校验：把读回的数据按编辑状态再解一次，逐项比对
    const p = xm1Parse(blob);
    const want = xm1Edit;
    const bad: string[] = [];
    if (p.active !== (want.active | 0)) bad.push(t("xm1FActive"));
    for (let i = 0; i < 4; i++) {
      const st = want.stages[i], clamp = (v: number) => Math.max(50, Math.min(30000, Math.round(v / 50) * 50));
      const v = clamp(st.x);                      // 写入时 Y 同步为 X
      if (p.stages[i].on !== !!st.on) bad.push("CPI " + (i + 1) + " " + t("on"));
      if (p.stages[i].x !== v) bad.push("CPI " + (i + 1) + " X");
      /* Y 不作为失败条件：XM1 固件根本不使用 Y，其读回值由设备自行处理。
         这里仅记录，便于日后判断固件是把 Y 同步成 X 还是原样保留。 */
      if (p.stages[i].y !== v) log("⋯ CPI " + (i + 1) + " 读回 Y=" + p.stages[i].y + "（XM1 固件不使用 Y，仅记录）");
    }
    if (Math.abs(xm1LodToMm(p.lodRaw) - want.lodMM) > 0.05) bad.push(t("xm1FLod"));
    if (!!p.ripple !== !!want.ripple) bad.push(t("xm1FRipple"));
    xm1Snapshot(t("xm1SnapAfterWrite"));
    if (bad.length) { banner("warn", t("xm1VerifyFail") + bad.join("、")); log("⋯ 回读不一致：" + bad.join("、")); }
    else { banner("ok", t("xm1Applied")); log("✓ XM1 写入成功并已回读校验（" + diffs.length + " 个字节）"); }
  } catch (e) {
    banner("err", t("xm1WriteFail") + e.message);
    log("✗ XM1 写入失败：" + e.message);
  }
}

/* XM1 视图：显示并编辑已实测确认的传感器字段。
   ★ 读取路径按官方 0x40FC80；写入按官方 0x41A070 事务（cmd 0x03 + 0x08 + 0x04），
     2026-10-09 回声闭环真机验证通过（re/XM1_NOTES.md 6.13/6.14）。
   ★ 写入边界：只允许改动 XM1_EDITABLE_OFFSETS 里的 23 个字节（全部经差分实测确认），
     其余字节必须与刚读回的数据逐字节一致 —— 由 protocol.ts 的 xm1GuardWrite 强制。
   ★ CPI 是**单值**：XM1 固件只读取 X、忽略 Y（6.15 节，实测 + 协议层双重印证）。 */
function renderXm1() {
  $("iModel").textContent = mouseName;
  $("iMouseFw").textContent = "—";
  $("iDongleFw").textContent = t("noDongleWired");
  $("iBattery").textContent = "—";
  $("iConn").textContent = t("wiredMode");
  $("iGen").textContent = "2020 (XM1)";

  // XM1 的表头含义与 4k 族不同（启用 / 激活 / X / Y）
  const ths = document.querySelectorAll("#cardSensor thead th");
  // ★ XM1 只有一个 CPI 值：固件只读 X、忽略 Y（实测 + 协议层双重印证），故合并为一列
  const labels = [t("stage"), t("xm1On"), t("xm1ActiveCol"), "CPI", ""];
  ths.forEach((el, i) => { if (labels[i]) el.textContent = labels[i]; });

  const tb = $("cpiRows");
  tb.innerHTML = "";
  if (!blob || !blob.length || !xm1Edit) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">${t("bRead")}</td>`;
    tb.appendChild(tr);
    return;
  }

  xm1Edit.stages.forEach((st, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>CPI ${i + 1}</td>` +
      `<td><input type="checkbox" data-on="${i}"${st.on ? " checked" : ""}></td>` +
      `<td style="text-align:center"><input type="radio" name="xm1act" data-act="${i}"${xm1Edit.active === i ? " checked" : ""}></td>` +
      `<td colspan="2"><input type="number" data-x="${i}" min="50" max="30000" step="50" value="${st.x}"></td>`;
    tb.appendChild(tr);
  });
  // 事件：直接改编辑状态，不立即写设备
  tb.querySelectorAll("input[data-on]").forEach(el => {
    el.onchange = () => { xm1Edit.stages[+el.dataset.on!].on = el.checked ? 1 : 0; };
  });
  tb.querySelectorAll("input[data-act]").forEach(el => {
    el.onchange = () => { xm1Edit.active = +el.dataset.act!; };
  });
  tb.querySelectorAll("input[data-x]").forEach(el => {
    el.oninput = () => { xm1Edit.stages[+el.dataset.x!].x = +el.value || 0; };
  });
  const note = document.createElement("tr");
  note.innerHTML = `<td colspan="5" class="muted">${t("xm1EditNote")}</td>`;
  tb.appendChild(note);

  // LOD / Ripple：XM1 只有这两个传感器项已核实
  const lodSel = $("lod");
  if (lodSel) {
    fillSelect(lodSel, [[1, "1 mm"], [2, "2 mm"], [3, "3 mm"]], Math.round(xm1Edit.lodMM));
    lodSel.disabled = false;
    lodSel.onchange = () => { xm1Edit.lodMM = +lodSel.value; };
  }
  const rip = $("ripple");
  if (rip) {
    rip.checked = !!xm1Edit.ripple;
    rip.disabled = false;
    rip.onchange = () => { xm1Edit.ripple = rip.checked ? 1 : 0; };
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
  if (apply) { apply.disabled = !xm1LastRead; apply.onclick = () => { void xm1Apply(); }; }
  const save = $("btnSave"); if (save) save.disabled = false;
  const echoBtn = $("btnXm1Echo");
  if (echoBtn) { echoBtn.style.display = ""; echoBtn.disabled = !xm1LastRead; }
  const undo = $("btnXm1Undo");
  if (undo) {
    undo.style.display = "";
    undo.disabled = xm1Snaps.length < 2;
    undo.textContent = t("xm1Undo") + " (" + xm1Snaps.length + ")";
  }
}
function render() {
  /* XM1：字段已实测确认，走 renderXm1() 的受限编辑器（写入只涉及 23 个已核实字节）。 */
  if (xm1) return renderXm1();

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

  /* 未真机验证的型号：禁用全部写入入口（guard4k 还会再兜一层）。
     读取、导出照常可用 —— 只读本身是有价值的，写入必须等硬件确认。 */
  if (unverified) {
    for (const id of ["btnApplySensor", "btnApplyPerf", "btnReset", "btnLoad"]) {
      const el = $(id); if (el) el.disabled = true;
    }
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
const writeSettle = () => wired ? 500 : 880;
const resetSettle = () => wired ? 800 : 1080;

/* ================= 写入后回读校验（4k 族） =================
   0x14 / 0x15 / 0x16 这些写入命令只回执行状态，**不回报配置内容**，
   所以"到底写进去没有"只能靠写完之后**重新读取**来确认。
   三个 apply 路径都已经调用 refreshAll()（内部 readBlob + parseBlob），
   因此校验就是：把「写入前的期望值」与「读回后的实际值」逐项比对。

   ⚠️ 刻意不校验的两类：
     · v1 的档位切换 —— v1 硬件忽略软件切换（见 v1StageNote）
     · 字节级差异 —— 设备可能对数值做规范化，语义比较更可靠 */

/** 写入前：记录传感器页期望值 */
function snapSensor(): any {
  return {
    cpi: stage.cpi.map((r: number[]) => [r[0] ? 1 : 0, r[1] | 0, r[2] | 0]),
    levels: stage.levels | 0,
    active: stage.active | 0,
    angleSnap: stage.angleSnap ? 1 : 0,
    ripple: stage.ripple ? 1 : 0,
    ledLiftoff: stage.ledLiftoff ? 1 : 0,
    lodMM: +stage.lodMM,
    glass: stage.glass ? 1 : 0,
    angleTune: (stage.angleTune << 24) >> 24,
  };
}

/** 写入后：比对传感器页，返回不一致项（空数组 = 一致） */
function verifySensor(w: any): string[] {
  const bad: string[] = [];
  for (let n = 0; n < 4; n++) {
    const a = stage.cpi[n] || [0, 0, 0];
    if (w.cpi[n][0] !== (a[0] ? 1 : 0)) bad.push(`CPI ${n + 1} XY-enable`);
    if (w.cpi[n][1] !== (a[1] | 0)) bad.push(`CPI ${n + 1} X ${w.cpi[n][1]}→${a[1] | 0}`);
    if (w.cpi[n][2] !== (a[2] | 0)) bad.push(`CPI ${n + 1} Y ${w.cpi[n][2]}→${a[2] | 0}`);
  }
  if (w.levels !== (stage.levels | 0)) bad.push(`Levels ${w.levels}→${stage.levels}`);
  if (gen === 2 && w.active !== (stage.active & 3)) bad.push(`Active stage ${w.active + 1}→${(stage.active & 3) + 1}`);
  if (w.angleSnap !== (stage.angleSnap ? 1 : 0)) bad.push("Angle Snap");
  if (w.ripple !== (stage.ripple ? 1 : 0)) bad.push("Ripple");
  if (w.ledLiftoff !== (stage.ledLiftoff ? 1 : 0)) bad.push("LED liftoff");
  if (Math.abs(w.lodMM - +stage.lodMM) > 0.05) bad.push(`LOD ${w.lodMM}mm→${stage.lodMM}mm`);
  if (gen === 2 && w.glass !== (stage.glass ? 1 : 0)) bad.push("Glass mode");
  if (gen === 2 && w.angleTune !== ((stage.angleTune << 24) >> 24)) bad.push("Angle Tune");
  return bad;
}

/** 写入前：记录性能/电源页期望值（开关位从 flags 现拆，不依赖 render 是否跑过） */
function snapPerf(): any {
  const f = stage.flags | 0;
  return {
    polling: stage.polling, motionSync: stage.motionSync ? 1 : 0,
    slamclick: f & 1 ? 1 : 0, jitter: f & 0x10 ? 1 : 0,
    multiclick: f & 0x20 ? 1 : 0, maxFps: f & 0x40 ? 1 : 0,
    powerSaving: stage.powerSaving, deepSleep: stage.deepSleep,
    filters: (stage.filters || []).slice(),
  };
}

/** 写入后：比对性能/电源页 */
function verifyPerf(w: any): string[] {
  const bad: string[] = [];
  const f = stage.flags | 0;
  if (w.polling !== stage.polling) bad.push(`Polling 0x${w.polling.toString(16)}→0x${stage.polling.toString(16)}`);
  if (w.motionSync !== (stage.motionSync ? 1 : 0)) bad.push("Motion Sync");
  if (w.slamclick !== (f & 1 ? 1 : 0)) bad.push("Slamclick");
  if (gen === 1 && w.jitter !== (f & 0x10 ? 1 : 0)) bad.push("Jitter filter");
  if (gen === 2 && w.multiclick !== (f & 0x20 ? 1 : 0)) bad.push("Multiclick");
  if (gen === 2 && w.maxFps !== (f & 0x40 ? 1 : 0)) bad.push("Force max FPS");
  if (w.powerSaving !== stage.powerSaving) bad.push(`Power saving ${w.powerSaving}→${stage.powerSaving}`);
  if (w.deepSleep !== stage.deepSleep) bad.push(`Deep sleep ${w.deepSleep}→${stage.deepSleep}`);
  for (let i = 0; i < w.filters.length; i++)
    if (w.filters[i] !== stage.filters[i]) bad.push(`Filter ${i + 1} ${w.filters[i]}→${stage.filters[i]}`);
  return bad;
}

/** 写入前：记录按键映射 */
function snapButtons(): any {
  return (stage.buttons || []).map((b: any) => ({ type: b.type, code: b.code, key: b.key, filter: b.filter }));
}

/** 写入后：比对按键映射 */
function verifyButtons(w: any[]): string[] {
  const bad: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const a = (stage.buttons || [])[i];
    if (!a) { bad.push(`Button ${i + 1} missing`); continue; }
    if (w[i].type !== a.type || w[i].code !== a.code || w[i].key !== a.key)
      bad.push(`Button ${i + 1} mapping`);
    if (w[i].filter !== a.filter) bad.push(`Button ${i + 1} filter ${w[i].filter}→${a.filter}`);
  }
  return bad;
}

/** 统一报告：不一致 → 列出具体项；一致 → 明确通过 */
function reportVerify(okKey: string, bad: string[]) {
  if (bad.length) {
    banner("warn", t("verifyFail") + bad.join("、"));
    log("⋯ 回读校验不一致（" + bad.length + " 项）：" + bad.join("、"));
  } else {
    banner("ok", t(okKey) + " · " + t("verifyOk"));
    log("✓ 回读校验通过：" + t(okKey));
  }
}

async function applySensor() {
  const want = snapSensor();                     // 期望值（写入前）
  const wantPerf = snapPerf();                   // 联动写 0x15 时玻璃模式也在里面
  const glassChanged = gen === 2 && (blob[0x6F] ? 1 : 0) !== stage.glass;
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
  const want = snapPerf();                       // 期望值（写入前）
  const wantSensor = snapSensor();               // 联动写 0x14 时传感器字段也在里面
  const glassChanged = gen === 2 && (blob[0x6F] ? 1 : 0) !== stage.glass;
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
    await probe();

    /* XM1：命令表只有 4 条（0x03/0x04/0x07/0x08）——没有 0x0D 固件、0x0E 型号、
       0xB4 电量，所以跳过这些查询，直接用 0xA1 空请求读 blob。
       读取路径已按官方 0x40FC80 修正（见 readBlobXm1 上方注释）；
       写入仍停用（重排层未核实），blob 仅供只读展示。 */
    if (xm1) {
      mouseName = modelOf(VID_22D4, dev.productId);
      gen = 0;
      dongleFw = "—"; mouseFw = "—"; battery = null;
      showCards();
      try {
        /* 先读单字节（官方读取事务的第一步）：回报率等全局量不在 blob 里，
           这条通道是唯一入口。只读，不含负载。 */
        await xm1QueryByte();
        await readBlob();
        xm1Edit = xm1Parse(blob);            // 编辑状态以读回值为初始
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

    try { const r = await guarded(0x0D, 0x00, null, { pace: 150 }); dongleFw = fwStr(r[16] | (r[17] << 8)); }
    catch (e) { if (e.code !== 0x07) throw e; dongleFw = "—"; }
    let mouseOk = false;
    try {
      const r = await guarded(0x0E, 0x00, null, { pace: 150 });
      const pid = r[18] | (r[19] << 8);
      if (MOUSE_PIDS[pid]) {
        mouseName = MOUSE_PIDS[pid][0]; gen = MOUSE_PIDS[pid][1];
        unverified = MOUSE_PIDS[pid][2] === 0;
      } else { mouseName = `Unknown (PID 0x${pid.toString(16)})`; gen = null; unverified = false; }
      mouseFw = fwStr(r[22] | (r[23] << 8));
      mouseOk = true;
    } catch (e) { if (![0x08, 0x11].includes(e.code)) throw e; }
    try { const r = await guarded(0xB4, 0x00, null, { pace: 150 }); battery = r[16]; } catch (e) { battery = null; }
    showCards();
    if (mouseOk) {
      await readBlob(); parseBlob(); render();
      if (unverified) banner("warn", t("bUnverifiedModel")); else banner("ok", t("bReadOk"));
    }
    else { render(); banner("warn", t("bSleep")); }
  } catch (e) { banner("err", t("bRead") + e.message); log("✗ " + e.message); }
}
function fwStr(v) { const h = v.toString(16).padStart(4, "0"); return `${parseInt(h.slice(0, 2), 16)}.${parseInt(h.slice(2), 16)}`; }
function showCards() { for (const id of ["cardInfo","cardSensor","cardPerf","cardBtns","cardTools"]) $(id).style.display = ""; }

/* ================= 连接 ================= */
/* ★★★ 页面卸载/关闭时必须释放已打开的 HID 接口。
 * WebHID 打开接口即独占，若页面被意外保留（浏览器崩溃、标签页恢复等），
 * 系统会一直认为该接口仍被占用 —— 极端情况下鼠标指针会一直失效。
 * 三个时机都兜一遍：beforeunload（用户关页/刷新）、pagehide（导航离开）、
 * visibilitychange 变 hidden（切走标签页，对应 macOS/Linux 的行为差异）。 */
let releasedOnHide = false;
async function releaseAllDevices() {
  try { await closeXm2we(); } catch (_) {}
  if (dev && dev.opened) { try { await dev.close(); } catch (_) {} }
  dev = null;
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
  dev = d;
  xm1 = isXm1(d.vendorId);
  wired = xm1 || d.productId !== DONGLE_PID;
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
  if (xm1) {
    const realSend = d.sendFeatureReport.bind(d);
    const echo = () => xm1LastRead;
    d.sendFeatureReport = async (reportId: number, data: any) => {
      const u8 = data instanceof Uint8Array ? data : null;
      // 校验全部来自 protocol.ts（与构造函数同一源头，并有单元测试覆盖）
      const ref = echo();
      const isQuery = xm1GuardQuery(reportId, u8);                       // ① 无负载查询，常驻
      const isEchoBlob = xm1Armed && xm1GuardWrite(reportId, u8, ref);  // ② 写 blob（仅限已核实字段）
      const isEchoByte = xm1Armed && xm1GuardEchoByte(reportId, u8, ref); // ③ 回声写单字节
      if (!isQuery && !isEchoBlob && !isEchoByte) {
        log(`✗ XM1 拦截：非常规发送（reportId=${reportId}, len=${u8?.length}, cmd=${u8?.[0] ?? "?"}, armed=${xm1Armed}）`);
        xm1Armed = false;
        xm1WriteDisabled();
      }
      return realSend(reportId, data);
    };
    (d as any).__realSend = realSend;
    log("⚠ XM1：读查询常驻放行；写 blob 仅允许「原样回声」（逐字节校验），其余一律拦截");
  }
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
      { vendorId: VID,     usagePage: 0xFF01, usage: 0x02 },  // 4k 无线族配置通道
      { vendorId: VID_22D4, usagePage: 0xFF01, usage: 0x02 },  // XM1 / XM1 RGB 配置通道
      { vendorId: VID,     usagePage: 0xFF02, usage: 0x02 },  // XM2we / OP1we 配置通道
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
function guard4k() {
  if (isXm2weOpen()) { banner("err", t("bWrongFamily")); log("✗ blocked: XM2we device connected"); throw new Error("wrong protocol family"); }
  /* 未真机验证的型号（8k 有线族）只读：协议同构是静态实证的，
     但 gen 编码与字段语义没在硬件上确认过 —— 按未验证的偏移写回去，
     正是 2026-10-09 把 XM1 配置写坏的同一个错误。 */
  if (unverified) { banner("err", t("bUnverifiedModel")); log("✗ blocked: model not verified on hardware (read-only)"); throw new Error("unverified model"); }
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
/* XM1 一键回退：把上一份快照（写入前 / 上一次读取）原样写回。
   快照之间的差异同样只落在已核实字段内，所以走的还是同一个白名单。 */
$("btnXm1Undo").onclick = async () => {
  if (xm1Snaps.length < 2) return banner("warn", t("xm1NoSnap"));
  const prev = xm1Snaps[xm1Snaps.length - 2];
  if (!window.confirm(t("xm1UndoConfirm").replace("{0}", new Date(prev.at).toLocaleTimeString()))) return;
  banner("warn", t("xm1Applying"));
  try {
    await writeBlobXm1(prev.blob);
    await readBlob();
    xm1Edit = xm1Parse(blob);
    render();
    xm1Snaps.pop();                        // 丢弃"当前"这一份，回到上一份
    banner("ok", t("xm1UndoOk"));
    log("✓ 已回退到快照（" + new Date(prev.at).toLocaleTimeString() + "，" + prev.label + "）");
  } catch (e) {
    banner("err", t("xm1WriteFail") + e.message);
    log("✗ 回退失败：" + e.message);
  }
};

$("btnSave").onclick = () => {
  if (!blob) return banner("err", t("cfgNoRead"));
  // 附带可读的 hex dump，便于人工比对与差分分析
  const hexLines = [];
  for (let o = 0; o < blob.length; o += 16) {
    const row = [];
    for (let i = 0; i < 16 && o + i < blob.length; i++) row.push(blob[o + i].toString(16).padStart(2, "0"));
    hexLines.push(o.toString(16).padStart(4, "0") + ": " + row.join(" "));
  }
  const out = { app: "endgame-gear-web-configurator", savedAt: new Date().toISOString(),
                device: mouseName, gen, lang: LANG,
                blobB64: btoa(String.fromCharCode(...blob)),
                blobHex: hexLines.join("\n") };
  download(JSON.stringify(out, null, 2), `egg-mouse-config-${Date.now()}.json`, "application/json");
};
/* XM1 原样写回测试：发送的每个字节都必须等于刚读回的那份（白名单强制）。
   成功后再读一次比对 —— 一致即说明「读=写同一套布局」闭环成立。 */
$("btnXm1Echo").onclick = async () => {
  if (!xm1LastRead) return banner("err", t("bRead"));
  if (!window.confirm(t("xm1EchoConfirm"))) return;
  const before = xm1LastRead.slice();
  banner("warn", t("xm1EchoRunning"));
  log(`⋯ 回声写回测试：将原样写回 ${before.length} 字节（内容 = 刚读回的那份）`);
  try {
    await writeBlobXm1();
    log("✓ 回声写回已发送，正在回读比对…");
    await readBlob();
    const same = !!blob && blob.length === before.length && blob.every((v, i) => v === before[i]);
    if (same) { banner("ok", t("xm1EchoOk")); log("✓ 回读与写前逐字节一致 —— 布局闭环成立，可以进入下一步"); }
    else { banner("warn", t("xm1EchoDiff")); log(`⋯ 回读与写前不同：${hex(blob, 32)}`); }
  } catch (e) {
    banner("err", t("xm1EchoFail") + e.message);
    log("✗ 回声写回失败：" + e.message);
  }
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
    const wantSensor = snapSensor(), wantPerf = snapPerf(), wantBtns = snapButtons();
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

applyI18n();
log("ℹ ready. Click 'Connect' and pick the Endgame Gear mouse / dongle.");
if (!("hid" in navigator))
  banner("warn", LANG === "zh"
    ? "此环境没有 WebHID：内置预览/iframe/Firefox 都不支持。请把这个 index.html 下载到本地，用 Chrome 或 Edge 直接打开。"
    : "No WebHID here: embedded previews/iframes/Firefox are not supported. Download index.html and open it directly in Chrome or Edge.");
else
  log("✓ WebHID available (" + navigator.userAgent.match(/(Edg|Chrome)\/[\d.]+/)?.[0] + ")");