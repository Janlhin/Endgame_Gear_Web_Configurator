import { errMsg, errCode } from "./err.js";
/** 写入流程与刷新：把编辑后的设置下发到设备，再回读校验。
 *
 *  这一层是调度 —— 按当前设备族选写命令，写完统一走 refreshAll 重读比对。
 *  它依赖 render（写完要刷新界面），但不被 render 依赖，故不成环。
 */
import { log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S, blob } from "./state.js";
import { buildSensorPayload, buildPowerPayload, parseBlob, xm1Parse } from "./blob.js";
import { snapSensor, verifySensor, snapPerf, verifyPerf, snapButtons, verifyButtons, reportVerify } from "./verify.js";
import { readBlob } from "./device-4k.js";
import { readBlob8k, store8k, verifySensor8k, verifyPerf8k } from "./device-8k.js";
import { xm1QueryByte, xm1Snapshot } from "./device-xm1.js";
import { render, renderXm1, renderInfoOnly } from "./render.js";
import { layoutFor, applyLayout } from "./layout.js";
import { dev, guarded, probe } from "./transport.js";
import { buildBlob8k, PID_FAMILY4, PID_8K, VID_22D4, MOUSE_PIDS, modelOf } from "./protocol.js";

/** 固件版本 → "major.minor"（次版本号十进制补零两位）。
 *
 *  ★ 设备是「major 在前、minor 在后」两个**独立字节**，不是一个小端 u16。
 *    依据：第四族同样是这个布局（re/FAMILY4_NOTES.md:76 ——
 *    MAJOR=payload[0] / MINOR=payload[+1] / BUILD=payload[+2]）。
 *
 *  ★ 2026-10-20 修正：此前把 r[22] | (r[23]<<8) 当 u16 拼起来，
 *    再让本函数按「高字节=major」去拆 —— 两处方向相反，**双重反转**
 *    把主次版本号对调了。官方工具显示「鼠标固件 1.07 / 接收器固件 1.01」，
 *    我们却显示「7.1 / 1.1」。修正为直接收两个字节，主次不再靠拼装顺序隐含。 */
export function fwStr(major: number, minor: number) {
  return `${major}.${String(minor).padStart(2, "0")}`;
}

export async function refreshAll() {
  banner("warn", "");
  try {
    /* 第四协议族（XM1r / OP1 / OP1 RGB）：只显示型号与原因，不发送任何报文。
       该族报文格式与本工具实现的三族完全不同（64B 包 + 54 条 kCom* 命令 + 口令握手），
       在没有实现之前连接它是无意义的；明确告知比"连不上"更有用。 */
    if (S.family4) {
      S.mouseName = PID_FAMILY4[dev().productId] || t("f4Unknown");
      S.mouseFw = "—"; S.dongleFw = "—"; S.battery = null;
      applyLayout("unsupported");
      renderInfoOnly();
      banner("warn", t("bFamily4"));
      log(`⚠ 第四协议族：VID=0x${dev().vendorId.toString(16)} PID=0x${dev().productId.toString(16)}，仅识别不通信`);
      return;
    }
    /* 8k 有线族：从 PID 即可确定型号（有线直连，无需 0x0E 查询），
       读走 0x12 + 1024B 帧，写走 0x11 整块写。 */
    if (S.eightK) {
      S.mouseName = PID_8K[dev().productId];
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
        banner("err", t("bRead") + errMsg(e));
        log("✗ " + errMsg(e));
      }
      return;
    }
    await probe();

    /* XM1：命令表只有 4 条（0x03/0x04/0x07/0x08）——没有 0x0D 固件、0x0E 型号、
       0xB4 电量，所以跳过这些查询，直接用 0xA1 空请求读 blob。
       读取路径已按官方 0x40FC80 修正（见 readBlobXm1 上方注释）；
       写入仍停用（重排层未核实），blob 仅供只读展示。 */
    if (S.xm1) {
      S.mouseName = modelOf(VID_22D4, dev().productId);
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
        S.xm1Edit = xm1Parse(blob());            // 编辑状态以读回值为初始
        xm1Snapshot(t("xm1SnapRead"));
        parseBlob();
        render();
        banner("warn", t("xm1EditNote"));
        log(`✓ XM1 blob 已读取（可编辑 23 个已核实字段）`);
      } catch (e) {
        renderXm1();
        banner("err", t("bRead") + errMsg(e));
        log("✗ XM1 读取失败: " + errMsg(e));
      }
      return;
    }

    try { const r = await guarded(0x0D, 0x00, null, { pace: 150 }); S.dongleFw = fwStr(r[16], r[17]); }
    catch (e) { if (errCode(e) !== 0x07) throw e; S.dongleFw = "—"; }
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
      S.mouseFw = fwStr(r[22], r[23]);
      mouseOk = true;
    } catch (e) { const c = errCode(e); if (c === undefined || ![0x08, 0x11].includes(c)) throw e; }
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
  } catch (e) { banner("err", t("bRead") + errMsg(e)); log("✗ " + errMsg(e)); }
}

export async function apply8k() {
  const want = snapSensor(), wantPerf = snapPerf();
  const nb = buildBlob8k(blob(), S.stage);               // 从读回值出发，只打补丁
  const acked = await store8k(nb);
  log(acked ? "✓ 8k STORE 已确认（ACK）" : "⋯ 8k STORE 未收到 ACK，继续回读校验");
  await refreshAll();
  reportVerify("bSensor", verifySensor8k(want).concat(verifyPerf8k(wantPerf)));
}

export async function applySensor() {
  if (S.writing) return banner("warn", t("bBusy"));
  S.writing = true;
  try {
    if (S.eightK) return await apply8k();          // 8k 是整块写，两张卡共用一条路径
    const want = snapSensor();                     // 期望值（写入前）
    const wantPerf = snapPerf();                   // 联动写 0x15 时玻璃模式也在里面
    const glassChanged = S.gen === 2 && (blob()[0x6F] ? 1 : 0) !== S.stage.glass;
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
  } finally { S.writing = false; }
}

export async function applyPerf() {
  if (S.writing) return banner("warn", t("bBusy"));
  S.writing = true;
  try {
    if (S.eightK) return await apply8k();          // 同上：8k 的性能项与传感器项在同一次整块写里
    const want = snapPerf();                       // 期望值（写入前）
    const wantSensor = snapSensor();               // 联动写 0x14 时传感器字段也在里面
    const wantButtons = snapButtons();              // 点击过滤随 0x15 一起下发，一并快照
    const glassChanged = S.gen === 2 && (blob()[0x6F] ? 1 : 0) !== S.stage.glass;
    await guarded(0x15, 0x0F, buildPowerPayload(), { lenByte: 0x0A, pace: writeSettle() });
    log("✓ cmd 0x15 written");
    if (glassChanged) {
      await guarded(0x14, 0x0F, buildSensorPayload(), { pace: writeSettle() });
      log("✓ glass-mode linked cmd 0x14 written");
    }
    await refreshAll();
    const bad = verifyPerf(want);
    /* ★ 也校验按钮的 filter —— 0x15 的 p[4..8] 就是前 5 个按键的 filter 槽。
       此前这条路径完全不校验按钮 filter，于是「点错了值把设备配置改坏」
       在界面上是**静默**的。 */
    bad.push(...verifyButtons(wantButtons));
    if (glassChanged) bad.push(...verifySensor(wantSensor));
    reportVerify("bPerf", bad);
  } finally { S.writing = false; }
}


export const writeSettle = () => S.wired ? 500 : 880;
export const resetSettle = () => S.wired ? 800 : 1080;
