/** WebHID 连接与安全闸门。
 *
 *  ★ 本模块决定「能不能打开一个 HID 接口」，是整个项目最危险的一步：
 *    误开鼠标指针集合（UP:0001/0002）会独占该接口，让鼠标彻底无法移动
 *    （2026-10-09 真实发生过；关掉页面即恢复，插拔 USB 无效）。
 *    规则：filter 必须精确限定到厂商集合、open() 前后各查一次、
 *    宁可拒绝连接也不要猜。
 *
 *  ★ 键盘集合（UP:0001/0006）的策略在 2026-10-20 调整过一次：
 *    Chrome 155 起会把同一 USB 接口的全部顶层集合合并成一个 HIDDevice，
 *    有线 4k 鼠标（如 0x1982）因此必然带键盘集合。旧的「一律拒绝」等于
 *    禁掉全部有线配置；现改为「与已知厂商配置集合共存时放行 + 警告」，
 *    纯键盘设备仍在 bNotVendor 处被拦。指针集合仍无条件拒绝。
 */
import { $, $el, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { setConn, render } from "./render.js";
import { refreshAll } from "./session.js";
import { closeXm2we, isXm2weOpen } from "./xm2we-ui.js";
import { xm1WriteDisabled } from "./transport.js";
import { resetToInitial, watchDisconnect, watchPresence } from "./presence.js";
import type { LostReason } from "./presence.js";
import { isXm1, is8k, isFamily4, USAGE_FAMILY4, DONGLE_PIDS,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte } from "./protocol.js";

export async function releaseAllDevices() {
  try { await closeXm2we(); } catch (_) {}
  if (S.dev && S.dev.opened) { try { await S.dev.close(); } catch (_) {} }
  S.dev = null;
}

/** 设备不在了 —— 唯一的一条复位路径。
 *
 *  一切「设备丢失」的信号（HIDDevice 的 disconnect 事件、定时清点、切后台主动释放）
 *  都汇到这里：先释放接口，再把状态与界面复位到初始态。
 *  ★ 只有一条路径是刻意的 —— 每个信号各自实现一遍「清状态」，
 *    迟早会出现某条路径漏清一个量，那正是本项目最忌讳的状态残留。 */
export async function onDeviceLost(reason: LostReason) {
  const name = (S.mouseName && S.mouseName !== "—") ? S.mouseName : (S.dev?.productName ?? "?");
  await releaseAllDevices();
  resetToInitial(reason, name);
}

/* 定时清点用的「设备位」：4k / XM1 / 8k 这条通道的设备存在 S.dev。
   XM2we 是另一个模块自己的设备，由 xm2we-ui.ts 单独登记 —— 两族不会同时打开。 */
watchPresence("main", () => S.dev, reason => { void onDeviceLost(reason); });

export function isSafeToOpen(d: HIDDevice): { ok: boolean; why?: string; note?: string } {
  const cols = d.collections || [];
  if (!cols.length) return { ok: false, why: t("bNoCollections") };
  // ① 致命项：鼠标指针集合 —— 无条件拒绝（2026-10-09 事故：独占后鼠标彻底无法移动）
  if (cols.some(c => c.usagePage === POINTER_PAGE && c.usage === POINTER_USAGE))
    return { ok: false, why: t("bRefusePointer") };
  // ② 必须含厂商集合，否则不是配置接口（纯键盘 / 纯消费设备在这里被挡）
  if (!cols.some(c => c.usagePage >= VENDOR_PAGE_MIN))
    return { ok: false, why: t("bNotVendor") };
  // ③ 键盘集合：原先一刀切拒绝。但 Chrome 155 起会把同一 USB 接口的全部顶层集合
  //    合并成一个 HIDDevice（键盘 + 厂商配置同设备，2026-10-20 实测 4k 有线鼠如此），
  //    一刀切等于禁掉全部有线配置 —— 这正是「修好判族后有线路径仍不可用」的原因。
  //    新策略：仅当设备同时含**已知厂商配置集合**（FF01:02 / FF02 / FFA1:00A5）时
  //    放行并警告（note）。能走到这里的设备必先通过 VID+厂商页 filter，不会是
  //    真正的系统键盘；真纯键盘在 ② 就被 bNotVendor 拦住，含键盘却无厂商配置
  //    集合的仍被 bRefuseKeyboard 拦住。
  if (cols.some(c => c.usagePage === KEYBOARD_PAGE && c.usage === KEYBOARD_USAGE)) {
    const hasConfig = cols.some(c =>
      (c.usagePage === 0xFF01 && c.usage === 0x02) ||
      c.usagePage === 0xFF02 ||
      (c.usagePage === USAGE_FAMILY4.page && c.usage === USAGE_FAMILY4.usage));
    if (!hasConfig) return { ok: false, why: t("bRefuseKeyboard") };
    return { ok: true, note: t("bKeyboardMerged") };
  }
  return { ok: true };
}

export async function openGuarded(d: HIDDevice) {
  const guard = isSafeToOpen(d);
  if (!guard.ok) {
    log("✗ 拒绝打开：" + guard.why);
    banner("err", guard.why);
    return false;
  }
  if (guard.note) { log("⚠ " + guard.note); banner("warn", guard.note); }
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

export async function openDevice(d: HIDDevice) {
  if (!(await openGuarded(d))) return;
  S.dev = d;
  /* 拔线/断电时浏览器会在该设备上触发 disconnect —— 比定时清点快得多。
     两者共用 onDeviceLost()，重复触发也只是再复位一次（幂等）。 */
  watchDisconnect(d, reason => { void onDeviceLost(reason); });
  S.xm1 = isXm1(d.vendorId);
  S.eightK = !S.xm1 && is8k(d.productId);
  S.family4 = !S.xm1 && !S.eightK && (isFamily4(d.productId)
            || (d.collections || []).some((c) => c.usagePage === USAGE_FAMILY4.page));
  S.wired = S.xm1 || S.eightK || S.family4 || !DONGLE_PIDS.includes(d.productId);
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
   *   放行条件是**受限编辑白名单**（protocol.ts 的 xm1GuardWrite）：
   *   除 23 个真机差分确认的偏移外，其余字节必须与刚读回的那份 1024B
   *   逐字节相同；且 buf[5] / cmd0x04 的值必须等于该 blob 的第 0 字节
   *   （blob[0] 不在白名单内，恒不可改）。
   *   → 发出去的每个可写字节都来自用户对已核实字段的编辑，未核实字段
   *     永远是设备刚给的值，配置不可能被改坏（可证明无损）。
   *
   * 【一律拦截】其余任何发送，尤其"非回声"的 1041B。
   * 依据：2026-10-09 事故（发送 0xA0 全零 1024B blob 导致 DPI/CPI 清零）。
   * 比"全禁"更精确：全禁会让 XM1 完全不可用，而上述报文可证明安全。 */
  if (S.xm1) {
    const realSend = d.sendFeatureReport.bind(d);
    const echo = () => S.xm1LastRead;
    d.sendFeatureReport = async (reportId: number, data: BufferSource) => {
      // 只接受 Uint8Array：HID 的 sendFeatureReport 虽签名 BufferSource，
      // 但本项目的报文一律是 Uint8Array。其他类型一律视为非常规发送并拦截
      //（u8 为 null ⇒ 三个 guard 全部返回 false ⇒ 落入拦截分支）。
      const u8 = data instanceof Uint8Array ? data : null;
      // 校验全部来自 protocol.ts（与构造函数同一源头，并有单元测试覆盖）
      const ref = echo();
      const isQuery = xm1GuardQuery(reportId, u8);                       // ① 无负载查询，常驻
      const isEchoBlob = S.xm1Armed && xm1GuardWrite(reportId, u8, ref);  // ② 写 blob（仅限已核实字段）
      const isEchoByte = S.xm1Armed && xm1GuardEchoByte(reportId, u8, ref); // ③ 回声写单字节
      if (!isQuery && !isEchoBlob && !isEchoByte) {
        // ★ 审计发现（2026-10-09）：原实现在此处log +解 armed + xm1WriteDisabled()
        //   之后**仍然执行 realSend()** —— 即「拦截」只是抛异常让后续流程中断，
        //   **那条非常规报文本身已经发给了设备**。
        //   与上方注释宣称的「一律拦截」矛盾，且直接违反本闸门的设计依据
        //   （2026-10-09 事故：发送 0xA0 全零1024B blob 导致 DPI/CPI 清零）。
        //   throw 只能阻止「后续动作」，阻止不了「已发生的发送」。
        // 所以拦截必须**不发送**：显式 return，不落到下面的 realSend。
        // 保留 xm1WriteDisabled() 的抛异常——它负责 banner 提示与文案，
        // 让调用方知道「本次写入已被拒绝」，而不是静默失败。
        log(`✗ XM1 拦截：非常规发送（reportId=${reportId}, len=${u8?.length}, cmd=${u8?.[0] ?? "?"}, armed=${S.xm1Armed}）`);
        S.xm1Armed = false;
        return xm1WriteDisabled();
      }
      return realSend(reportId, data);
    };
    // __realSend：原始 sendFeatureReport 的旁路句柄。
    // 用途——re/test_write_gates.ts 需要验证「闸门本身没被改坏」：
    // 它要绕过闸门发一次报文，对照闸门逻辑前后行为是否一致。
    // ⚠️ 这是给回归测试留的后门，**生产路径不得调用**。
    // 用扩展类型而非 any：只有这一个属性，且名字自带注释含义。
    (d as HIDDevice & { __realSend?: HIDDevice["sendFeatureReport"] }).__realSend = realSend;
    log("⚠ XM1：读查询常驻放行；写 blob 仅允许「原样回声」（逐字节校验），其余一律拦截");
  }
  // 回调参数声明为 Event 再转型：HIDDevice 继承自 EventTarget，
  // 其 addEventListener 的签名要求 (evt: Event) => void，
  // 直接写 (e: HIDInputReportEvent) 会因参数类型逆变而不兼容。
  // 运行时浏览器给的就是 HIDInputReportEvent，转型是安全的。
  S.dev.addEventListener("inputreport", (ev) => {
    const e = ev as HIDInputReportEvent;
    if (e.data.byteLength < 2) return;
    const code = e.data.getUint8(0), v = e.data.getUint8(1);
    if (code === 0xB4) { S.battery = e.data.getUint8(2); render(); log(`⚡ battery event: ${S.battery}%`); }
    else if (code === 0xB1) { log(v === 1 ? "⚡ radio link: up" : "⚡ radio link: down (mouse asleep)"); }
  });
  setConn(true, S.wired ? t("connectedWired") : t("connectedWireless"));
  $el<HTMLButtonElement>("btnRefresh").disabled = false;
  log(`✓ opened ${d.productName} VID=0x${d.vendorId.toString(16)} PID=0x${d.productId.toString(16)}`);
  await refreshAll();
}

/** 原生确认框的包装：Node（离线测试）里没有 window.confirm，
 *  此时一律当作"用户未确认" —— 测试环境绝不可能意外放行写入。 */
export function confirmBeta(msg: string): boolean {
  // window 在 Node 里不存在（re/*.ts 离线跑时无 DOM），故先typeof 探测。
  // 关键：**探测不到就返回 false**，绝不能因为「拿不到 window」就默认放行写入。
  if (typeof globalThis === "undefined") return false;
  const w = (globalThis as { window?: { confirm?: (m: string) => boolean } }).window;
  if (!w || typeof w.confirm !== "function") return false;
  return !!w.confirm(msg);
}

/** 打开实验写入：置位 + 强制先导出一份备份（写坏了还有得救）。 */
export function armBeta() {
  S.betaArmed = true;
  // $() 的返回类型尚未收敛（见 TASKS.md T-112），故此处仍需断言。
  // 语义要保住：**按钮不存在时不阻断**（导出失败不该卡住授权流程）。
  try { ($("btnSave") as HTMLElement | null)?.click?.(); } catch (_) { /* 导出失败不阻断，仅记录 */ }
  banner("warn", t("betaArmed"));
  log("⚠ 实验写入已开启（仅本次连接）：" + t("betaBackup"));
}

export function guard4k(needConfig = true) {
  if (isXm2weOpen()) { banner("err", t("bWrongFamily")); log("✗ blocked: XM2we device connected"); throw new Error("wrong protocol family"); }
  /* ★ 8k 有线族：默认只读，**用户点确认后**才在本次连接内放行。
     设计取舍：
       · 全禁 → 远程志愿者（唯一有 8k 设备的人）根本没法帮我们验证，协议永远停在"未验证"；
       · 全开 → 别人一接上就能写没验证过的路径，这是本项目最忌讳的事。
     所以走「默认关 + 显式确认 + 强制先导出备份 + 只管本次连接」四件套。
     确认框用原生 confirm：它是同步的，能保证"没确认就一定不会走到发送那一步"。 */
  if (S.eightK && !S.betaArmed) {
    if (!confirmBeta(t("betaConfirm", S.mouseName || "8k"))) {
      log("⋯ 用户取消了实验写入（保持只读）");
      banner("warn", t("b8kNote"));
      throw new Error("user declined experimental write");
    }
    armBeta();
  }
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
