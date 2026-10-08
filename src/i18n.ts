// i18n 词典 / 翻译 / 应用
import { $ } from "./util.js";

const I18N = {
  "zh-CN": {
    appTitle: "Endgame Gear 网页版驱动", notConnected: "未连接", connectedWired: "已连接（有线）", connectedWireless: "已连接（无线）",
    connect: "连接设备", refresh: "重新读取",
    secInfo: "设备信息", model: "型号", mouseFw: "鼠标固件", dongleFw: "接收器固件", battery: "电量", connMode: "连接方式", gen: "协议代数",
    secSensor: "传感器 / CPI", stage: "档位", ledColor: "LED 颜色", xySplit: "XY 独立", cpiLevels: "启用档位数", activeStage: "当前档位",
    lod: "抬离距离 (LOD)", glassMode: "玻璃面模式", off: "关", on: "开", glassNote: "v2 专属；切换时 LOD 编码会随之换算",
    angleSnap: "角度捕捉", ripple: "波纹控制", ledLiftoff: "抬离时 LED", angleTune: "角度调校 (°)", angleTuneNote: "v2 专属",
    applySensor: "应用传感器设置", secPerf: "性能 / 电源", polling: "回报率", slamclick: "Slamclick 过滤",
    jitter: "抖动过滤 (v1)", maxFps: "强制最高传感器 FPS (v2)", multiclick: "多击确认过滤 (v2)",
    powerSaving: "省电超时 (分钟)", deepSleep: "深度休眠 (分钟)", applyPerf: "应用性能/电源",
    secButtons: "按键映射与点击过滤", button: "按键", mapping: "映射", clickFilter: "点击过滤",
    btnReadonly: "按键重映射（0x16 双块写）已在协议层实现，暂未开放编辑；点击过滤可单独调整后随“应用性能/电源”下发。",
    secTools: "配置备份 / 恢复 / 工具", exportCfg: "导出配置 (.json)", importCfg: "导入配置并写入", exportBlob: "导出原始 1024B blob (.bin)",
    pair: "重新配对接收器", factoryReset: "恢复出厂设置", toggleLog: "显示/隐藏通讯日志",
    pairDefault: "恢复默认配对", getPairData: "读取配对数据",
    cfPairDefault: "恢复默认配对会把鼠标与接收器的配对关系重置为出厂默认，需要重新配对吗？",
    bPairDefaultOk: "默认配对命令已发送。", bPairDataOk: "配对数据：",
    persistNote: "写入立即持久化（无需保存操作）；0x13 是恢复出厂而非保存，慎用。",
    secCredits: "致谢与参考", secNotes: "说明与已知限制",
    minutes: "分钟", charging: "充电中（约 {0}%）", wiredMode: "有线 (USB-C)", wirelessMode: "无线 (4k 接收器)",
    noDongleWired: "—（有线连接无接收器）", current: "（当前）",
    bRead: "读取失败：", bWritten: "已写入并持久化。", bSensor: "传感器设置已写入并持久化。", bPerf: "性能/电源设置已写入并持久化。",
    bSleep: "鼠标处于休眠或未上电：动一下鼠标，再点「重新读取」。", bReadOk: "已读取当前配置。", bPairSent: "配对命令已发送，等待鼠标重连…",
    bResetOk: "已恢复出厂设置。", bImportFail: "导入失败：", bConnectFail: "连接失败：", bNoWebhid: "此浏览器不支持 WebHID，请使用 Chrome / Edge 89+。",
    bImportOk: "配置已恢复。",
    cfPair: "重新配对会让鼠标与接收器重建无线链路（设置不受影响），继续？",
    cfReset1: "⚠️ 恢复出厂设置将清空全部自定义配置（CPI、回报率、按键映射等），确定继续？",
    cfReset2: "再次确认：真的要恢复出厂设置吗？",
    errWrite: "写入失败：", cfgNoRead: "尚未读取配置",
    v1StageNote: "（v1 硬件忽略软件切换，请用鼠标底部按键）", pollWiredNote: "（有线连接硬件上限 1000 Hz，写入的存储值不变）",
    gxSafe: "GX Safe", gxSpeed: "GX Speed", disabled: "禁用", fixedCpi: "固定 CPI", cpiCycle: "CPI 循环切换",
    minutesFmt: "{0} 分钟", keyboardMap: "键盘 (修饰 0x{0}, 键 0x{1})", mouseBtn: "鼠标键 0x{0}", specialFn: "特殊功能 0x{0}", mediaKey: "多媒体键 0x{0}", typeRaw: "类型 0x{0}",
    langName: "简体中文",
    crVole: "完整的 USB 配置协议逆向（Ghidra 反汇编 + 44 次抓包 + 真机验证），4k 族协议层的唯一依据。",
    crXm2we: "XM2we 2020 有线/2.4G 族的完整协议文档与两个独立实现（常量互证），本页 XM2we 功能的依据。",
    crBattery: "电池状态 HID 协议文档。",
    crUnleashed: "XM2we 直接通信探索。",
    crSiblings: "同类 WebHID 网页配置器（分别覆盖 8k 系与 OP1w 4k）；XM2w 4k v1/v2 的网页配置器目前仅此一家。生态调研见 docs/ecosystem-survey.md。",
    crJzab: "Linux 配置工具的先行实践与协议验证。",
    crVendor: "硬件本身，以及未混淆、可分析的官方工具。",
    crDisclaimer: "本项目为独立开源工具，与 Endgame Gear / Pro Gamersware GmbH 无隶属关系；不修改固件，仅读写用户配置。",
    noteWebhid: "需要 Chrome / Edge 89+（WebHID）。本页通过 HID 特征报告直连设备，不装任何驱动。",
    noteModels: "支持全部四个无线型号：XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2，有线（USB-C）与无线（4k 接收器）均可。型号由 cmd 0x0E 返回的鼠标 PID 自动识别。",
    noteWiredOnly: "有线专用型号（XM1 等 2020 代）使用另一套协议族（报告 0x08/0x09 + 0x55 校验帧 + EEPROM），尚未支持；XM2we 已支持。",
    noteWeSleep: "XM2we 鼠标空闲约 4 秒即休眠，此时 EEPROM 读写不回应——动一下鼠标再读取。电量与链路由接收器缓存，休眠时仍能读到。",
    noteSleep: "鼠标深度休眠后读不到配置：动一下鼠标再点“重新读取”。软件会自动发探测命令恢复通道。",
    noteWired: "有线连接时 0x0D（接收器固件）会返回“不适用”；有线回报率硬件上限 1000 Hz。",
    noteV1Stage: "v1 的“当前档位”只能用鼠标底部的 CPI 键切换，软件改了也无效（硬件忽略）。",
    noteRe: "协议已对照官方 v1.02 配置工具二进制逐字节验证：命令表、负载长度、blob 布局、双块写入与重试时序全部一致；0x71/0x72（默认配对/配对数据）为官方工具新增命令，本页已同步实现。",
    /* ---- XM2we（2020 有线·2.4G 代）---- */
    secWeInfo: "设备信息（XM2we / 有线代）", weLink: "鼠标链路", weFamilyNote: "本型号属 2020 年有线/2.4G 协议族（接口页 0xFF02、报告 0x08/0x09、17 字节带校验帧、配置存于 EEPROM），与 4k 无线族完全不兼容。",
    secWeCpi: "CPI 与回报率", weCheck: "校验", weSlot1Note: "槽位 1 是当前生效的 CPI，写入即刻改变指针速度，无需保存或断电。鼠标上的按钮切换的是回报率而非 CPI 档位——它的闪烁次数很容易被误读成档位。",
    weDebounce: "点击去抖 (ms)", wePollingNote: "存放为 one-hot 掩码：0x08=125 / 0x04=250 / 0x02=500 / 0x01=1000 Hz",
    secWeBtns: "按键矩阵（EEPROM 0x60）",
    weKeyNote: "本族仅 type 0x01（鼠标键位掩码：0x01 左 / 0x02 右 / 0x04 中 / 0x08 后退 / 0x10 前进）被社区解出；其余类型语义未知，工具原样读取展示，不做改写。",
    secWeTools: "EEPROM 备份 / 恢复", weExport: "导出 EEPROM (.txt)",
    weWriteNote: "配置区为 EEPROM 0x00–0xB4（共 181 字节），每帧最多带 10 字节，故读取需约 19 个来回；每条记录都带 0x55 补码校验，校验只保证记录边界正确、不代表字段语义已解出。写入一律回读验证。",
    weLinkUp: "在线", weLinkDown: "离线（鼠标未上电或休眠）", weLinkUnknown: "未知",
    weSlot: "槽位", weSlot1Tag: "（生效中）", weBadRecord: "校验失败",
    weReadProgress: "读取 EEPROM…{0}/{1} 字节", weReadOk: "已读取 XM2we 配置。", weApplyOk: "已写入并回读校验通过。",
    weNoDevice: "尚未连接 XM2we 设备。", weWakeHint: "鼠标处于休眠：动一下鼠标再点「重新读取」。",
    bWrongFamily: "当前连接的是 XM2we（2020 协议族），此操作属于 4k 族，已阻止以免写坏 EEPROM。",
    xm1BlobNote: "XM1：blob 字段语义尚未核实（官方内部布局与线上布局之间还有一层重排），因此本页只读展示原始字节、不提供写入。等重排层核实后再开放。",
    bFallbackAll: "精确过滤未匹配到设备，已回退到全量列表。请在选择器中挑选 Endgame Gear 设备（VID 0x22D4 = XM1，0x3367 = 4k/XM2we）。",
  },
  "en": {
    appTitle: "Endgame Gear Web Configurator", notConnected: "Not connected", connectedWired: "Connected (wired)", connectedWireless: "Connected (wireless)",
    connect: "Connect device", refresh: "Reload",
    secInfo: "Device Info", model: "Model", mouseFw: "Mouse firmware", dongleFw: "Dongle firmware", battery: "Battery", connMode: "Connection", gen: "Protocol gen",
    secSensor: "Sensor / CPI", stage: "Stage", ledColor: "LED color", xySplit: "XY split", cpiLevels: "Active stages", activeStage: "Current stage",
    lod: "Lift-off distance (LOD)", glassMode: "Glass mode", off: "Off", on: "On", glassNote: "v2 only; LOD encoding switches with it",
    angleSnap: "Angle snapping", ripple: "Ripple control", ledLiftoff: "LED on lift-off", angleTune: "Angle tuning (°)", angleTuneNote: "v2 only",
    applySensor: "Apply sensor settings", secPerf: "Performance / Power", polling: "Polling rate", slamclick: "Slamclick filter",
    jitter: "Motion jitter filter (v1)", maxFps: "Force max sensor FPS (v2)", multiclick: "Multiclick filter (v2)",
    powerSaving: "Power saving (min)", deepSleep: "Deep sleep (min)", applyPerf: "Apply performance/power",
    secButtons: "Button mapping & click filters", button: "Button", mapping: "Mapping", clickFilter: "Click filter",
    btnReadonly: "Button remapping (0x16 two-chunk write) is implemented at protocol level but not editable yet; click filters below are applied with 'Apply performance/power'.",
    secTools: "Backup / Restore / Tools", exportCfg: "Export config (.json)", importCfg: "Import config & write", exportBlob: "Export raw 1024B blob (.bin)",
    pair: "Re-pair dongle", factoryReset: "Factory reset", toggleLog: "Toggle communication log",
    pairDefault: "Pair default", getPairData: "Get pair data",
    cfPairDefault: "Pair-default resets the mouse↔dongle link to the factory default pairing. Continue?",
    bPairDefaultOk: "Pair-default command sent.", bPairDataOk: "Pair data: ",
    persistNote: "Writes persist immediately (no commit step); 0x13 is factory reset, not save — use with care.",
    secCredits: "Credits & References", secNotes: "Notes & Known Limitations",
    minutes: "min", charging: "Charging (≈ {0}%)", wiredMode: "Wired (USB-C)", wirelessMode: "Wireless (4k dongle)",
    noDongleWired: "— (no dongle on cable)", current: " (current)",
    bRead: "Read failed: ", bWritten: "Written and persisted.", bSensor: "Sensor settings written and persisted.", bPerf: "Performance/power written and persisted.",
    bSleep: "Mouse is asleep or powered off: move it, then click 'Reload'.", bReadOk: "Configuration loaded.", bPairSent: "Pair command sent, waiting for mouse…",
    bResetOk: "Factory reset done.", bImportFail: "Import failed: ", bConnectFail: "Connection failed: ", bNoWebhid: "WebHID not supported — use Chrome / Edge 89+.",
    bImportOk: "Configuration restored.",
    cfPair: "Re-pairing rebuilds the radio link (settings are unaffected). Continue?",
    cfReset1: "⚠️ Factory reset wipes ALL custom settings (CPI, polling, button mapping…). Continue?",
    cfReset2: "Confirm again: really factory reset?",
    errWrite: "Write failed: ", cfgNoRead: "No configuration read yet",
    v1StageNote: " (v1 hardware ignores software stage switch — use the CPI button under the mouse)", pollWiredNote: " (capped at 1000 Hz on cable; the stored value is unchanged)",
    gxSafe: "GX Safe", gxSpeed: "GX Speed", disabled: "Disabled", fixedCpi: "Fixed CPI", cpiCycle: "CPI cycle",
    minutesFmt: "{0} min", keyboardMap: "Keyboard (mods 0x{0}, key 0x{1})", mouseBtn: "Mouse button 0x{0}", specialFn: "Special 0x{0}", mediaKey: "Consumer 0x{0}", typeRaw: "Type 0x{0}",
    langName: "English",
    crVole: "Complete USB configuration-protocol reverse engineering (Ghidra disassembly + 44 USB captures + on-device verification); the sole basis for the 4k-family protocol layer.",
    crXm2we: "The complete protocol documentation for the XM2we 2020 wired/2.4G family plus two independent implementations (constants cross-verified) — the basis for this page's XM2we support.",
    crBattery: "Battery-status HID protocol documentation.",
    crUnleashed: "Direct-communication exploration for XM2we.",
    crSiblings: "Sibling WebHID web configurators (covering the 8k lineup and OP1w 4k respectively); this is currently the only web configurator for XM2w 4k v1/v2. Ecosystem survey in docs/ecosystem-survey.md.",
    crJzab: "Prior art: Linux configuration tool and protocol verification.",
    crVendor: "The hardware itself, plus official tools shipped unobfuscated and analyzable.",
    crDisclaimer: "Independent open-source project, not affiliated with Endgame Gear / Pro Gamersware GmbH; firmware is never modified — user configuration only.",
    noteWebhid: "Requires Chrome / Edge 89+ (WebHID). This page talks to the device directly via HID feature reports — no drivers installed.",
    noteModels: "All four wireless models supported: XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2, wired (USB-C) or wireless (4k dongle). The model is auto-detected from the mouse PID returned by cmd 0x0E.",
    noteWiredOnly: "Wired-only models from the 2020 generation (XM1 etc.) use a different protocol family (reports 0x08/0x09 with 0x55 checksum frames + EEPROM) and are not supported yet; XM2we is supported.",
    noteWeSleep: "The XM2we mouse sleeps after ~4 s idle and then stops answering EEPROM accesses — move it and reload. Battery and link state are cached by the receiver and still readable.",
    noteSleep: "Deep-sleeping mice can't be read: move the mouse, then click 'Reload'. The app sends probe commands to reopen the channel automatically.",
    noteWired: "On cable, 0x0D (dongle firmware) reports 'not applicable'; wired polling rate is hardware-capped at 1000 Hz.",
    noteV1Stage: "On v1 the active stage can only be switched with the CPI button under the mouse — software changes are ignored by hardware.",
    noteRe: "The protocol was byte-verified against the official v1.02 configuration tool binary: command table, payload lengths, blob layout, two-chunk writes and retry timing all match; 0x71/0x72 (pair default / pair data) are new official commands, implemented here as well.",
    /* ---- XM2we (2020 wired / 2.4G generation) ---- */
    secWeInfo: "Device Info (XM2we / wired gen)", weLink: "Mouse link", weFamilyNote: "This model belongs to the 2020 wired/2.4G protocol family (usage page 0xFF02, reports 0x08/0x09, 17-byte checksummed frames, config stored in EEPROM) — completely incompatible with the 4k wireless family.",
    secWeCpi: "CPI & Polling Rate", weCheck: "Check", weSlot1Note: "Slot 1 is the CPI in use; writing it changes pointer speed immediately, no save or power cycle. The button on the mouse cycles the polling rate, NOT the CPI stage — its blink count is easily mistaken for a stage indicator.",
    weDebounce: "Click debounce (ms)", wePollingNote: "Stored as a one-hot mask: 0x08=125 / 0x04=250 / 0x02=500 / 0x01=1000 Hz",
    secWeBtns: "Key Matrix (EEPROM 0x60)",
    weKeyNote: "For this family only type 0x01 is decoded (mouse button bitmask: 0x01 left / 0x02 right / 0x04 middle / 0x08 back / 0x10 forward). Other types are shown verbatim and never rewritten, since their semantics are unknown.",
    secWeTools: "EEPROM Backup / Restore", weExport: "Export EEPROM (.txt)",
    weWriteNote: "Config lives in EEPROM 0x00–0xB4 (181 bytes) and a frame carries at most 10 bytes, so a read takes ~19 round trips. Every record carries a 0x55-complement checksum — a valid checksum only confirms record boundaries, not that the fields' meaning is understood. Every write is verified by reading back.",
    weLinkUp: "up", weLinkDown: "down (mouse off or asleep)", weLinkUnknown: "unknown",
    weSlot: "Slot", weSlot1Tag: " (in use)", weBadRecord: "bad checksum",
    weReadProgress: "Reading EEPROM… {0}/{1} bytes", weReadOk: "XM2we configuration loaded.", weApplyOk: "Written and verified by read-back.",
    weNoDevice: "No XM2we device connected yet.", weWakeHint: "Mouse is asleep: move it, then click 'Reload'.",
    bWrongFamily: "An XM2we device (2020 protocol family) is connected. This action belongs to the 4k family and was blocked to avoid corrupting the EEPROM.",
    xm1BlobNote: "XM1: blob field semantics are not yet verified (the vendor applies an extra re-ordering layer between its internal and on-wire layouts), so this page shows the raw bytes read-only and offers no write. Writing will be enabled once that layer is confirmed.",
    bFallbackAll: "Precise filters matched nothing, falling back to the full device list. Pick the Endgame Gear device in the chooser (VID 0x22D4 = XM1, 0x3367 = 4k/XM2we).",
  }
};

let LANG = localStorage.getItem("xm2w-lang") || "zh-CN";
function t(key, ...args) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N["zh-CN"][key] || key;
  args.forEach((a, i) => s = s.replace(`{${i}}`, a));
  return s;
}

export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = (el as HTMLElement).dataset.i18n;
    const v = (I18N[LANG] && I18N[LANG][k]) || I18N["zh-CN"][k];
    if (v != null) el.textContent = v;  // 查不到就保留 HTML 原文，绝不显示键名
  });
  document.documentElement.lang = LANG;
  $("langSel").value = LANG;
}

$("langSel").onchange = e => {
  LANG = (e.target as HTMLSelectElement).value;
  localStorage.setItem("xm2w-lang", LANG);
  applyI18n();
  document.dispatchEvent(new CustomEvent("langchange"));  // main.ts 收到后重渲染
};

export { I18N, LANG, t };
