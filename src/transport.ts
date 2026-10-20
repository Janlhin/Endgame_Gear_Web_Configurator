import { errMsg } from "./err.js";
/** HID 传输层：报文收发、事务串行化、探测/唤醒、状态判定。
 *
 *  从 main.ts 拆出来（原本 1678 行、12 个职责混在一起）。这是最底层的设备 I/O，
 *  所有设备族（4k / XM1 / 8k / XM2we）都经由它下发命令。
 *
 *  ★ 安全相关的搬运都在这一层：把「能不能发这份报文」的闸门放在离 sendFeatureReport
 *    最近的地方，调用方就绕不过去 —— 只靠调用方自觉是 2026-10-09 那次事故的成因。
 */
import { sleep, log, banner } from "./util.js";
import { RPT_CMD } from "./protocol.js";
import { S } from "./state.js";
import { t } from "./i18n.js";

export class StatusError extends Error {
  code: any;
  constructor(code: any, msg: string) { super(msg); this.code = code; }
}

/** 取当前设备，**未连接即抛**。
 *
 *  所有报文都经本模块下发，故把「设备必须已连接」这个契约收在这里——
 *  调用方不必各自 `if (!S.dev) return`，也不可能忘记。
 *
 *  ★ 为什么用抛而不用 `?.` / `if` 静默返回：
 *  设备未连接时发出报文是**编程错误**（调用顺序错了），不是可恢复的运行时状态。
 *  静默跳过会让人以为「发出去了」，而实际上什么都没发生——
 *  这正是 2026-10-09 那次「点了没反应」的成因。
 *  抛出来则会被上层的 try/catch 捕获并显示成明确的错误信息。 */
export function dev(): HIDDevice {
  if (!S.dev) throw new Error("设备未连接");
  return S.dev;
}

/** XM1 写入的兜底闸门：任何下发给 XM1 的命令报文都会撞上它。
 *  XM1 的写入只能走「回声」路径（见 device-xm1 的 writeBlobXm1Echo），
 *  绝不允许经由这条通用命令通道 —— 2026-10-09 曾因下发 1041B 全零 blob
 *  把用户鼠标的 DPI/CPI 清零。 */
export function xm1WriteDisabled(): never {
  banner("warn", t("xm1WriteOff"));
  throw new Error(t("xm1Blocked") + " (re/XM1_NOTES.md 6.5 / 6.13)");
}

/* rawReceive 归一化：Chrome 各平台对 receiveFeatureReport 的返回不一致——
   可能带 reportId、剥掉 reportId（payload-only）、或把 reportId 置 0（零占位）。
   参考 qsxcv/UnofficialEGGWebConfig 的 eggNormalizeFeature（re/upstream/）。
   v2 固件的 0xA0 响应首字节是 0xA1 回显，由 readBlob 的双格式分支处理。 */
export async function rawReceive(reportId: number, size?: number) {
  /* WebHID 的 receiveFeatureReport(reportId) 用 reportId 定位报告。
     ★ XM1 的 1041B 报告首字节是 **0xA1**，不是 0xA0！
       官方 0x40FC80：memset(1041B,0) / mov byte [buf], 0xA1 /
       push 0x411 / push buf / call HidD_GetFeature
       即 GetFeature 的 reportId 取自**缓冲区首字节** = 0xA1。
       （曾误传 0xA0 → 设备把空请求原样回显，日志里全是 0x00。）
     size：某些实现需要显式长度，XM1 走 1041B 时传它。 */
  const d = size !== undefined ? await dev().receiveFeatureReport(reportId, size)
                               : await dev().receiveFeatureReport(reportId);
  /* ★ 必须尊重 DataView 的 byteOffset/byteLength：规范允许实现返回底层缓冲区
     的一段视图（而非整块）。直接 new Uint8Array(d.buffer) 会把视图前后的
     无关字节一并读进来，导致长度/偏移判定错乱（2026-10-20 审计）。 */
  let u8 = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (u8.length && u8[0] === 0x00) u8 = u8.slice(1);              // 零占位 → 丢弃
  if (u8.length && u8[0] === reportId) return u8;                 // 已含 reportId
  const out = new Uint8Array(u8.length + 1); out[0] = reportId; out.set(u8, 1); return out;
}

/** 4k 族的 64B 命令通道：发送 → 读状态 → 重试。所有命令经 S.queue 串行化。 */
export async function transact(cmd: number, target = 0x00, payload: number[] | null = null, opt: any = {}) {
  /* XM1 不走 4k 族的命令通道：它的命令表只有 4 条，报文形态也完全不同
     （读 = 0xA1 空请求 + GetFeature 读回，见 readBlobXm1）。
     4k 的 13 条命令若发给 XM1 会被当作乱码配置，故一律拒绝。
     另：2026-10-09 事故记录见 readBlobXm1 上方注释——曾因发送 1041B
     全零 blob（写形态）把用户鼠标的 DPI/CPI 清零。 */
  if (S.xm1) xm1WriteDisabled();
  const run = async () => {
    const buf = new Uint8Array(63);                  // sendFeatureReport 的 data 不含 reportId
    buf[0] = cmd; buf[1] = target;
    buf[2] = opt.lenByte !== undefined ? opt.lenByte : (payload ? payload.length : 0);
    if (opt.chunk) buf[6] = opt.chunk;
    if (payload) buf.set(payload, 15);               // 报告内偏移 16 = 去掉 ID 后的 15
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await dev().sendFeatureReport(RPT_CMD, buf); }
      catch (e) { log(`✗ SET fail (cmd 0x${cmd.toString(16)}): ${errMsg(e)}`); if (attempt === 3) throw e; await sleep(60); continue; }
      await sleep(opt.pace || 170);
      let u8;
      try { u8 = await rawReceive(RPT_CMD); }
      catch (e) { log(`✗ GET fail: ${errMsg(e)}`); if (attempt === 3) throw e; await sleep(60); continue; }
      const status = u8[1];
      if (status === 0x01) { S.lastFail = false; return u8; }
      if (status === 0x03) { log(`⋯ busy, retry #${attempt + 1}`); await sleep(200 * (attempt + 1)); continue; }
      S.lastFail = true;
      const map: Record<number, string> = { 0x07: "N/A on this connection", 0x08: "mouse asleep/unreachable", 0x11: "mouse asleep/unreachable" };
      log(`✗ cmd 0x${cmd.toString(16)} status=0x${status.toString(16)} (${map[status] || "unknown"})`);
      throw new StatusError(status, map[status] || "device error 0x" + status.toString(16));
    }
    throw new StatusError(0x03, "device stays busy");
  };
  // p 的类型是 transact 的返回值（Uint8Array），但队列只需要「排一次执行」——
  // S.queue 的类型是 Promise<void>，故显式把结果吞掉。
  // 用 .then(run, run) 而非 .then(() => run())：onRejected 也要走同一个 run，
  // 前一个事务失败不能卡死队列。
  const p: Promise<Uint8Array> = S.queue.then(run, run);
  S.queue = p.then(() => {}, () => {});
  return p;
}

/* 探测/唤醒。0x0F 是**无线专属**唤醒（官方仅 0x22 路径唤醒，见 re/PROTOCOL_NOTES.md）：
   有线直连时发 0x0F 两个变体都会回状态 7，且会让后续写入被 ACK 后静默丢弃
   （zexsso/OP1-WebAPP device.ts 真机验证）。有线直接走 0x0E 读鼠标信息。
   XM1 的命令表只有 4 条（0x03/0x04/0x07/0x08），**没有 0x0E/0x0F**，
   故 XM1 跳过探测直接读 blob。 */
export async function probe() {
  if (S.xm1) return;                       // XM1 无探测命令
  if (!S.wired) {
    try { await transact(0x0F, 0x01, null, { pace: 120 }); return; } catch (e) { /* 试下一变体 */ }
    try { await transact(0x0F, 0x0F, null, { pace: 120 }); return; } catch (e) { /* 落到 0x0E */ }
  }
  await transact(0x0E, 0x00, null, { pace: 120 });
}

/** 带自愈的事务：上次失败过就先探一次，再重放本次命令。 */
export async function guarded(cmd: number, target: number, payload: any = null, opt: any = {}) {
  if (S.lastFail) { try { await probe(); } catch (e) { throw new StatusError(0x08, "mouse unreachable — move it and retry"); } }
  return transact(cmd, target, payload, opt);
}
