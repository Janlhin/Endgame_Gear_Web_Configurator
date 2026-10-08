/** WebHID 连接与安全闸门。
 *
 *  ★ 本模块决定「能不能打开一个 HID 接口」，是整个项目最危险的一步：
 *    误开鼠标指针集合（UP:0001/0002）会独占该接口，让鼠标彻底无法移动
 *    （2026-10-09 真实发生过；关掉页面即恢复，插拔 USB 无效）。
 *    规则：filter 必须精确限定到厂商集合、open() 前后各查一次、
 *    宁可拒绝连接也不要猜。
 */
import { $, sleep, hex, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { setConn, render } from "./render.js";
import { refreshAll } from "./session.js";
import { closeXm2we, isXm2weOpen } from "./xm2we-ui.js";
import { xm1WriteDisabled } from "./transport.js";
import { isXm1, is8k, isFamily4, USAGE_FAMILY4, DONGLE_PID,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte } from "./protocol.js";

export async function releaseAllDevices() {
  try { await closeXm2we(); } catch (_) {}
  if (S.dev && S.dev.opened) { try { await S.dev.close(); } catch (_) {} }
  S.dev = null;
}

export function isSafeToOpen(d) {
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

export async function openGuarded(d) {
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

export async function openDevice(d) {
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

export function guard4k(needConfig = true) {
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


export const POINTER_PAGE = 0x0001, POINTER_USAGE = 0x0002;
export const KEYBOARD_PAGE = 0x0001, KEYBOARD_USAGE = 0x0006;
export const VENDOR_PAGE_MIN = 0xFF00;
