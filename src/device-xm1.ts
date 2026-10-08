/** XM1 / XM1 RGB（VID 0x22D4，2020 有线变体）的配置读写。
 *
 *  ★ 这个模块承载本项目最重的一段安全约束：写入只允许「回声」——
 *    下发的 1024B 必须逐字节来自刚读回的数据，且只放开 23 个差分实测确认的字节
 *    （protocol.ts 的 xm1GuardWrite 强制）。2026-10-09 曾因下发 1041B 全零 blob
 *    把用户鼠标的 DPI/CPI 清零，完整证据链见 re/XM1_NOTES.md。
 *
 *  ★ 这里直接调 readBlobXm1 而非 readBlob：后者是「按族分发」的调度，
 *    对 XM1 而言本来就是转调本函数 —— 直接调用可让本模块不依赖 device-4k。
 */
import { $, sleep, hex, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { rawReceive } from "./transport.js";
import { RPT_CMD, RPT_BULK, XM1_SETTLE_MS, buildXm1BlobReport, buildXm1ByteReport, xm1GuardEchoByte } from "./protocol.js";
import { looksLikeBlob, xm1Parse, XM1_F, XM1_STAGE_ON, xm1LodToMm, xm1MmToLod } from "./blob.js";

export function xm1QueryReq(cmd: number) {
  const b = new Uint8Array(63);
  b[0] = cmd;
  return b;
}

export async function xm1QueryByte() {
  try {
    await S.dev.sendFeatureReport(RPT_CMD, xm1QueryReq(0x03));
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

export async function readBlobXm1() {
  let lastDump = "";
  for (let round = 1; round <= 4; round++) {
    // ① 发 64B 空请求（无负载，不改动鼠标任何配置）
    try {
      await S.dev.sendFeatureReport(RPT_CMD, XM1_READ_REQ);
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
      S.blob = cand;
      S.xm1LastRead = cand.slice();          // 写入只能「回声」这一份（逐字节相等校验）
      S.lastFail = false;
      log(`✓ XM1 blob read OK (${S.blob.length} B @off ${off}, round ${round})  head: ${hex(S.blob, 32)}`);
      return;
    }
    lastDump = hex(cand, 32);
    log(`⋯ XM1 blob 校验未过, round ${round}, head: ${lastDump}`);
    await sleep(300);
  }
  S.lastFail = true;
  throw new Error("XM1 blob read failed after 4 rounds; last: " + lastDump);
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
export async function writeBlobXm1(payloadIn?: Uint8Array) {
  const ref = S.xm1LastRead;
  if (!S.dev || !S.xm1) throw new Error("XM1 未连接");
  if (!ref || ref.length !== 1024) throw new Error("尚未成功读取过配置");
  if (S.lastFail) throw new Error("设备状态异常，请先重新读取");

  await xm1QueryByte();                                   // ① 握手（空载荷）

  const data = buildXm1BlobReport(payloadIn || ref);      // ② 写 blob（构造与校验同源）
  S.xm1Armed = true;
  try {
    await S.dev.sendFeatureReport(RPT_BULK, data);
    await sleep(XM1_SETTLE_MS);
    try { await rawReceive(RPT_CMD); } catch (e) { /* 官方的 64B 确认读，失败不致命 */ }
    await S.dev.sendFeatureReport(RPT_CMD, buildXm1ByteReport(ref[0]));   // ③ 写单字节 = blob[0]
    await sleep(XM1_SETTLE_MS);
  } finally {
    S.xm1Armed = false;                                     // 无论成败，立刻解除武装
  }
}

export function xm1Snapshot(label: string) {
  if (!S.xm1LastRead) return;
  const last = S.xm1Snaps[S.xm1Snaps.length - 1];
  if (last && last.blob.length === S.xm1LastRead.length && last.blob.every((v, i) => v === S.xm1LastRead![i])) return;
  S.xm1Snaps.push({ at: Date.now(), label, blob: S.xm1LastRead.slice() });
  if (S.xm1Snaps.length > 20) S.xm1Snaps.shift();
  const b = $("btnXm1Undo");
  if (b) b.textContent = t("xm1Undo") + " (" + S.xm1Snaps.length + ")";
}

export function xm1PatchEdit(ref: Uint8Array, e: any): Uint8Array {
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

export function xm1FieldName(off: number): string {
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

export async function xm1Apply() {
  if (!S.xm1LastRead || !S.xm1Edit) return banner("err", t("bRead"));
  const next = xm1PatchEdit(S.xm1LastRead, S.xm1Edit);
  const diffs: number[] = [];
  for (let i = 0; i < 1024; i++) if (next[i] !== S.xm1LastRead[i]) diffs.push(i);
  if (!diffs.length) return banner("warn", t("xm1NoChange"));

  const lines = diffs.map(o => "  0x" + o.toString(16).padStart(3, "0") + "  " +
    xm1FieldName(o) + "   " + S.xm1LastRead[o].toString(16).padStart(2, "0") + " → " +
    next[o].toString(16).padStart(2, "0")).join("\n");
  if (!window.confirm(t("xm1ApplyConfirm").replace("{0}", String(diffs.length)) + "\n\n" + lines)) return;

  xm1Snapshot(t("xm1SnapBeforeWrite"));
  banner("warn", t("xm1Applying"));
  try {
    await writeBlobXm1(next);
    /* 直接调 readBlobXm1（不是按族分发的 readBlob）：对 XM1 而言两者等价，
       但这样本模块就不需要反向依赖 device-4k，避免模块间成环。 */
    await readBlobXm1();
    // 回读校验：把读回的数据按编辑状态再解一次，逐项比对
    const p = xm1Parse(S.blob);
    const want = S.xm1Edit;
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


export const XM1_READ_REQ = xm1QueryReq(0x07);
