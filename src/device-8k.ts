import { errMsg } from "./err.js";
/** 8k 有线族（XM2 8k / OP1 8k 及 v2 / PF / Raw）的读取与整块写。
 *
 *  与 4k 无线族的差异**只有写命令**：读仍是 0x12 + 1024B blob，blob 偏移逐字节相同。
 *  4k 用 0x14/0x15/0x16 分块写，8k 用 **0x11 整块写**。
 *  ⚠️ 尚无线材真机验证，故写入严格读-改-写：未确认字段一律保持设备刚给的值。
 */
import { sleep, hex, log } from "./util.js";
import { t } from "./i18n.js";
import { S, type Stage } from "./state.js";
import { dev, rawReceive } from "./transport.js";
// buildBlob8k 不在这里导入：8k 的写入编排（buildBlob8k → store8k）在
  // session.ts 的 apply8k()，本文件只负责「整块发出去」那一步。
  // 2026-10-09 清理此前残留的导入。
  import { RPT_CMD, RPT_BULK, build8kStoreData } from "./protocol.js";
import { looksLikeBlob8k } from "./blob.js";

/* ★ 8k 的读写时序常量 —— 与 OpenMouse 的 egg-op1-hid（readConfigRaw / writeConfigRaw）
   逐项一致，属两侧各自对官方工具与真机观测后收敛到同一组数字，不要"优化"掉：
     重试 4 次 × 间隔 50 ms、写后 300 ms 再轮询 ACK、ACK 最多 8 次、
     LOAD 之后等 80 ms、轮询退避 60 ms 起、上限 400 ms。 */
const STORE_RETRIES = 4;
const STORE_RETRY_GAP_MS = 50;
const STORE_SETTLE_MS = 300;
const ACK_POLLS = 8;
const LOAD_SETTLE_MS = 80;
const POLL_BACKOFF_MS = 60;
const POLL_BACKOFF_MAX_MS = 400;

export async function readBlob8k() {
  const cmd = new Uint8Array(63); cmd[0] = 0x12;      // LOAD，无负载
  let last = "";
  for (let round = 1; round <= 3; round++) {
    try { await dev().sendFeatureReport(RPT_CMD, cmd); }
    catch (e) { log(`✗ 8k LOAD 发送失败: ${errMsg(e)}`); await sleep(200); continue; }
    await sleep(LOAD_SETTLE_MS);
    let delay = POLL_BACKOFF_MS;
    for (let poll = 0; poll < 6; poll++) {
      for (const rid of [RPT_CMD, RPT_BULK]) {
        let u8;
        try { u8 = await rawReceive(rid); } catch (e) { continue; }
        if (u8.length < 16 + 1024) { last = `len=${u8.length} [${hex(u8, 8)}]`; continue; }
        const cand = u8.slice(16, 16 + 1024);
        if (u8[1] === 0x01 && looksLikeBlob8k(cand)) {
          S.blob = cand;
          S.lastFrame = u8.slice();
          S.frameAligned = true;
          S.lastFail = false;
          log(`✓ 8k blob read OK (${S.blob.length} B @off 16, report 0x${u8[0].toString(16)})  head: ${hex(S.blob, 16)}`);
          return;
        }
        last = `status=0x${u8[1].toString(16)} levels=${u8[16 + 0x0E]} polling=${u8[16 + 0x05]}`;
      }
      await sleep(delay); delay = Math.min(delay * 2, POLL_BACKOFF_MAX_MS);
    }
    log(`⋯ 8k 读取第 ${round} 轮未取得有效帧（${last}）`);
  }
  S.lastFail = true;
  throw new Error(`8k blob read failed; last: ${last}`);
}

export async function pollAck8k(polls: number): Promise<boolean> {
  for (let i = 0; i < polls; i++) {
    try { const u8 = await rawReceive(RPT_CMD); if (u8[1] === 0x01) return true; } catch (e) { /* 忽略，继续轮询 */ }
    await sleep(60 + i * 40);
  }
  return false;
}

export async function store8k(newBlob: Uint8Array): Promise<boolean> {
  if (!S.lastFrame || !S.frameAligned)
    throw new Error(t("b8kNoFrame"));
  const data = build8kStoreData(S.lastFrame, newBlob);
  // 记录最后一次失败的原因，供 4 次重试后判断。类型从any 收窄为 unknown——
  // 只需要 log(errMsg(e)) 能处理任意值，不需要具体类型。
  let lastErr: unknown = null;
  for (let a = 0; a < STORE_RETRIES; a++) {
    try { await dev().sendFeatureReport(RPT_BULK, data); lastErr = null; break; }
    catch (e) { lastErr = e; await sleep(STORE_RETRY_GAP_MS); }
  }
  if (lastErr) throw lastErr;
  await sleep(STORE_SETTLE_MS);                       // 官方/社区均等待后才轮询 ACK
  return pollAck8k(ACK_POLLS);
}

/** 回读校验：把「写之前想要的值」（want）与「写之后读回的值」逐项对比。
 *  参数是写入前的快照（session.ts 的 snapSensor / snapPerf），
 *  类型为 Stage —— 与 S.stage 同构，故能直接与读回值对照。 */
export function verifySensor8k(w: Stage): string[] {
  const bad: string[] = [];
  for (let n = 0; n < 4; n++) {
    const a = S.stage.cpi[n] || [0, 0, 0];
    if (w.cpi[n][0] !== (a[0] ? 1 : 0)) bad.push(`CPI ${n + 1} XY-enable`);
    if (w.cpi[n][1] !== (a[1] | 0)) bad.push(`CPI ${n + 1} X ${w.cpi[n][1]}→${a[1] | 0}`);
    const wantY = w.cpi[n][0] ? w.cpi[n][2] : w.cpi[n][1];
    if (wantY !== (a[2] | 0)) bad.push(`CPI ${n + 1} Y ${wantY}→${a[2] | 0}`);
  }
  if (w.levels !== (S.stage.levels | 0)) bad.push(`Levels ${w.levels}→${S.stage.levels}`);
  if (w.active !== (S.stage.active & 3)) bad.push(`Active stage ${w.active + 1}→${(S.stage.active & 3) + 1}`);
  if (w.angleSnap !== (S.stage.angleSnap ? 1 : 0)) bad.push("Angle Snap");
  if (w.ripple !== (S.stage.ripple ? 1 : 0)) bad.push("Ripple");
  return bad;
}

export function verifyPerf8k(w: Stage): string[] {
  const bad: string[] = [];
  const f = S.stage.flags | 0;
  if (w.polling !== S.stage.polling) bad.push(`Polling 0x${w.polling.toString(16)}→0x${S.stage.polling.toString(16)}`);
  if (w.motionSync !== (S.stage.motionSync ? 1 : 0)) bad.push("Motion Sync");
  // 这两个字段的类型已由 number 改为 boolean（见 state.ts 的 Stage 注释），
  // 故比较方式也从「!== 0/1」改为「!== true/false」——运行时等价，
  // 但和写入侧（`if (S.stage.slamclick) f |= 1`）的语义一致。
  if (w.slamclick !== !!(f & 1)) bad.push("Slamclick");
  if (w.jitter !== !!(f & 0x10)) bad.push("Jitter filter");
  return bad;
}

