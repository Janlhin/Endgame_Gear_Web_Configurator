import { errMsg } from "./err.js";
// 应用主体：全局状态 / 传输层 / blob 读写解析 / UI 渲染 / 连接与事件绑定
import { $, sleep, hex, log, banner } from "./util.js";
import { LANG, t, applyI18n } from "./i18n.js";
import { VID, VID_22D4, DONGLE_PID, DONGLE_PIDS, MOUSE_PIDS, RPT_CMD, RPT_BULK,
         XM1_MAX_STAGES, XM1_SETTLE_MS, isXm1, modelOf,
         buildXm1BlobReport, buildXm1ByteReport,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte,
         PID_8K, is8k, PID_FAMILY4, isFamily4, USAGE_FAMILY4,
         buildBlob8k, build8kStoreData } from "./protocol.js";
import { isXm2weFamily } from "./xm2we.js";
import { buildDiag } from "./diag.js";
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
import { render, renderXm1, renderInfoOnly, renderHelp } from "./render.js";
import { refreshAll, applySensor, applyPerf, resetSettle, writeSettle } from "./session.js";
import { releaseAllDevices, onDeviceLost, openDevice, guard4k } from "./connect.js";
import { resetToInitial } from "./presence.js";

// —— 语言切换时重渲染（i18n.ts 通过事件解耦） ——
/* 语言切换：applyI18n() 已在 i18n.ts 的 onchange 里跑过，这里补上
   「由 t() 生成的表头」与各卡片的重渲染。 */
document.addEventListener("langchange", () => { reapplyLayout(); renderHelp(); render(); });




/* 共享可变状态集中在 ./state.js（拆 main.ts 时搬走）：
   这些量被传输层、各设备族、渲染层共同读写，放一处才能避免模块间循环引用。
   引用统一写作 S.xxx —— 一眼可辨「这是跨模块状态」而不是局部量。 */


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




/* ================= blob 解析 / 编码 ================= */






/* ================= UI 渲染 ================= */








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

/* 第四协议族（XM1r / OP1 / OP1 RGB）专用：只填设备信息，不渲染任何可编辑控件。 */





/* ================= 应用流程 ================= */
/* 官方工具的写后 settle：有线 500ms / 无线 880ms（模式字节 0x11/0x22，见 re/PROTOCOL_NOTES.md） */


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






/* 卡片可见性统一由 layout.ts 的 applyLayout() 管理，这里不再各自 show/hide，
   避免「一处显示、另一处忘了隐藏」造成的跨型号残留。 */

/* ================= 连接 ================= */
/* ★★★ 页面卸载/关闭时必须释放已打开的 HID 接口。
 * WebHID 打开接口即独占，若页面被意外保留（浏览器崩溃、标签页恢复等），
 * 系统会一直认为该接口仍被占用 —— 极端情况下鼠标指针会一直失效。
 * 三个时机都兜一遍：beforeunload（用户关页/刷新）、pagehide（导航离开）、
 * visibilitychange 变 hidden（切走标签页，对应 macOS/Linux 的行为差异）。 */
let releasedOnHide = false;

window.addEventListener("beforeunload", () => { releaseAllDevices(); });
window.addEventListener("pagehide", () => { releaseAllDevices(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || releasedOnHide) return;
  // 延迟一点再关：visibilitychange 早期关闭可能被 Chrome 拒绝
  releasedOnHide = true;
  /* ★ 释放接口之后必须同步复位界面：接口已经关了，读写在物理上不可能成功，
     若界面还显示着「已连接 + 旧数据」，用户会以为改动生效了（比报错更糟）。
     走 onDeviceLost 与「拔线」同一条路径，只是换成说明原因的文案。 */
  setTimeout(() => { void onDeviceLost("devReleased"); }, 50);
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




/** 保险丝：open() 之后再复验一次 collections，若判定危险则立即 close()。
 *  即使未来有人误加了宽泛 filter，这条也能兜住（浏览器仍可能短暂独占接口，
 *  所以必须尽快释放）。 */



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
    let devs: HIDDevice[] = await navigator.hid.requestDevice({ filters });
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
    if (DONGLE_PIDS.includes(pick.productId))
      log("ℹ 已选择接收器。若鼠标此刻插着 USB 线，无线链路是断开的——请改选鼠标设备（或拔线后再连）。");
    await openDevice(pick);
  } catch (e) { banner("err", t("bConnectFail") + errMsg(e)); log("✗ " + errMsg(e)); }
};
$("btnRefresh").onclick = () => isXm2weOpen() ? refreshWe() : refreshAll();
/* 护栏：4k 族的写操作绝不能对 XM2we 族执行（协议族完全不同，会写坏 EEPROM）。
   正常路径下卡片已隐藏，这里再挡一次以防脚本/控制台误调。 */

$("btnApplySensor").onclick = () => { try { guard4k(); } catch { return; } applySensor().catch(e => banner("err", t("errWrite") + errMsg(e))); };
$("btnApplyPerf").onclick = () => { try { guard4k(); } catch { return; } applyPerf().catch(e => banner("err", t("errWrite") + errMsg(e))); };
$("btnPair").onclick = async () => {
  try { guard4k(false); } catch { return; }   // 0x70 零负载
  if (!confirm(t("cfPair"))) return;
  try { await guarded(0x70, 0x00, null, { pace: 300 }); log("✓ pair cmd sent"); banner("ok", t("bPairSent")); await sleep(2000); await refreshAll(); }
  catch (e) { banner("err", errMsg(e)); }
};
/* 0x71 = Pair Default（恢复默认配对，零负载，官方发后等 300ms）
   0x72 = Get Pair Data（读取配对数据，官方等 350ms 后收，负载偏移 16 起 16 字节）
   —— 均来自官方 v1.02 工具逆向，见 re/PROTOCOL_NOTES.md */
$("btnPairDefault").onclick = async () => {
  try { guard4k(false); } catch { return; }
  if (!confirm(t("cfPairDefault"))) return;
  try { await guarded(0x71, 0x00, null, { pace: 300 }); log("✓ pair-default cmd sent"); banner("ok", t("bPairDefaultOk")); await sleep(2000); await refreshAll(); }
  catch (e) { banner("err", errMsg(e)); }
};
$("btnPairData").onclick = async () => {
  try { guard4k(); } catch { return; }
  try {
    const r = await guarded(0x72, 0x00, null, { pace: 350 });
    const d = r.slice(16, 32);
    log("✓ pair data: " + hex(d, 16));
    banner("ok", t("bPairDataOk") + " " + hex(d, 16));
  } catch (e) { banner("err", errMsg(e)); }
};
$("btnReset").onclick = async () => {
  try { guard4k(false); } catch { return; }   // 0x13 零负载，不需要先读配置
  if (!confirm(t("cfReset1"))) return;
  if (!confirm(t("cfReset2"))) return;
  try { await guarded(0x13, 0x00, null, { pace: resetSettle() }); log("✓ factory reset done"); await refreshAll(); banner("ok", t("bResetOk")); }
  catch (e) { banner("err", errMsg(e)); }
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
    banner("err", t("xm1WriteFail") + errMsg(e));
    log("✗ 回退失败：" + errMsg(e));
  }
};

$("btnSave").onclick = () => {
  if (!S.blob) return banner("err", t("cfgNoRead"));
  // 附带可读的 hex dump，便于人工比对与差分分析
  const hexLines: string[] = [];
  for (let o = 0; o < S.blob.length; o += 16) {
    const row: string[] = [];
    for (let i = 0; i < 16 && o + i < S.blob.length; i++) row.push(S.blob[o + i].toString(16).padStart(2, "0"));
    hexLines.push(o.toString(16).padStart(4, "0") + ": " + row.join(" "));
  }
  const out = { app: "Endgame_Gear_Web_Configurator", savedAt: new Date().toISOString(),
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
    const same = !!S.blob && S.blob.length === before.length && S.blob.every((v: number, i: number) => v === before[i]);
    if (same) { banner("ok", t("xm1EchoOk")); log("✓ 回读与写前逐字节一致 —— 布局闭环成立，可以进入下一步"); }
    else { banner("warn", t("xm1EchoDiff")); log(`⋯ 回读与写前不同：${hex(S.blob, 32)}`); }
  } catch (e) {
    banner("err", t("xm1EchoFail") + errMsg(e));
    log("✗ 回声写回失败：" + errMsg(e));
  }
};

$("btnBlob").onclick = () => { if (S.blob) download(new Blob([S.blob]), `egg-mouse-blob-${Date.now()}.bin`); };
/* 测试数据包：型号 / PID / 固件 / 接口集合 / 完整 blob / 通讯日志一次带走，
   外加一份回报模板。给远程志愿者用 —— 他们手里正是我们没有的型号。 */
$("btnDiag").onclick = () => {
  try {
    download(JSON.stringify(buildDiag(), null, 2), `egg-mouse-diag-${Date.now()}.json`, "application/json");
    banner("ok", t("diagSaved"));
    log("✓ 测试数据包已导出（含 blob 与通讯日志）");
  } catch (e) { banner("err", t("cfgNoRead") + errMsg(e)); }
};
$("btnLoad").onclick = () => $("fileLoad").click();
$("fileLoad").onchange = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  /* ★ 导入配置同样是写入（0x14 + 0x15 + 0x16×2），必须过同一道闸门。
     此前这里没有 guard4k() —— 单靠按钮 disabled 是不设防的：
     只要 handler 能被触发（旧文件选择器、脚本调用），只读型号就会被写。 */
  try { guard4k(); } catch { (e.target as HTMLInputElement).value = ""; return; }
  /* 8k 的写是整块写：导入一个来自别的型号的 blob 等于把未知偏移整体覆盖 ——
     这正是 XM1 事故的形态。故 8k 暂不支持导入（导出不受影响）。 */
  if (S.eightK) { banner("err", t("b8kNoImport")); (e.target as HTMLInputElement).value = ""; return; }
  try {
    const j = JSON.parse(await f.text());
    /* ★ 跨代拦截：不同 gen 的字段编码不同（LOD：gen1 整毫米 / gen2 round(mm×10)−7；
       按键区、LED 区布局也不同）。把 v2 的配置导入 v1 设备，写入的字节会错位 ——
       与 2026-10-09 XM1 事故同一形态。文件里没有 gen 字段（旧版本导出）时不拦，
       只按长度校验，保持向后兼容。 */
    if (typeof j.gen === "number" && typeof S.gen === "number" && j.gen !== S.gen)
      throw new Error(t("importGenMismatch", String(j.gen), String(S.gen)));
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
  } catch (err) { banner("err", t("bImportFail") + errMsg(err)); }
  (e.target as HTMLInputElement).value = "";
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
renderHelp();  // 预设条与设置说明（只在初始化与语言切换时重建，避免重置 <details> 展开态）

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

/* 预览 / 无头回归钩子：#simulate=lost 跑一遍「设备丢失 → 复位到初始界面」。
   与 layout.ts 的 #layout= 同一套思路 —— 只影响界面，不授予任何设备能力
   （本就不发报文），目的是让没有实机时也能验证这条路径。
   典型用法 #layout=v2&simulate=lost：先套上型号布局，再演练丢失复位。 */
if (/(?:^|[#&])simulate=lost\b/.test(location.hash || "")) {
  log("ℹ #simulate=lost：演练设备丢失 → 复位到初始界面（预览 / 回归用）");
  resetToInitial("devGone", "simulate");
}