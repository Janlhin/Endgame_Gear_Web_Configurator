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
    crVole: "完整的 USB 配置协议逆向（Ghidra 反汇编 + 44 次抓包 + 真机验证），本工具的协议实现全部基于其 re/PROTOCOL.md。",
    crBattery: "电池状态 HID 协议文档。",
    crUnleashed: "XM2we 直接通信探索。",
    crSiblings: "同类 WebHID 网页配置器（分别覆盖 8k 系与 OP1w 4k）；XM2w 4k v1/v2 的网页配置器目前仅此一家。生态调研见 docs/ecosystem-survey.md。",
    crJzab: "Linux 配置工具的先行实践与协议验证。",
    crVendor: "硬件本身，以及未混淆、可分析的官方工具。",
    crDisclaimer: "本项目为独立开源工具，与 Endgame Gear / Pro Gamersware GmbH 无隶属关系；不修改固件，仅读写用户配置。",
    noteWebhid: "需要 Chrome / Edge 89+（WebHID）。本页通过 HID 特征报告直连设备，不装任何驱动。",
    noteModels: "支持全部四个无线型号：XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2，有线（USB-C）与无线（4k 接收器）均可。型号由 cmd 0x0E 返回的鼠标 PID 自动识别。",
    noteWiredOnly: "有线专用型号（XM2we、XM1 系列等）使用另一套未公开协议，暂不支持。",
    noteSleep: "鼠标深度休眠后读不到配置：动一下鼠标再点“重新读取”。软件会自动发探测命令恢复通道。",
    noteWired: "有线连接时 0x0D（接收器固件）会返回“不适用”；有线回报率硬件上限 1000 Hz。",
    noteV1Stage: "v1 的“当前档位”只能用鼠标底部的 CPI 键切换，软件改了也无效（硬件忽略）。",
    noteRe: "协议已对照官方 v1.02 配置工具二进制逐字节验证：命令表、负载长度、blob 布局、双块写入与重试时序全部一致；0x71/0x72（默认配对/配对数据）为官方工具新增命令，本页已同步实现。"
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
    crVole: "Complete USB configuration-protocol reverse engineering (Ghidra disassembly + 44 USB captures + on-device verification); this tool's protocol implementation is entirely based on their re/PROTOCOL.md.",
    crBattery: "Battery-status HID protocol documentation.",
    crUnleashed: "Direct-communication exploration for XM2we.",
    crSiblings: "Sibling WebHID web configurators (covering the 8k lineup and OP1w 4k respectively); this is currently the only web configurator for XM2w 4k v1/v2. Ecosystem survey in docs/ecosystem-survey.md.",
    crJzab: "Prior art: Linux configuration tool and protocol verification.",
    crVendor: "The hardware itself, plus official tools shipped unobfuscated and analyzable.",
    crDisclaimer: "Independent open-source project, not affiliated with Endgame Gear / Pro Gamersware GmbH; firmware is never modified — user configuration only.",
    noteWebhid: "Requires Chrome / Edge 89+ (WebHID). This page talks to the device directly via HID feature reports — no drivers installed.",
    noteModels: "All four wireless models supported: XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2, wired (USB-C) or wireless (4k dongle). The model is auto-detected from the mouse PID returned by cmd 0x0E.",
    noteWiredOnly: "Wired-only models (XM2we, XM1 series) use a different undocumented protocol and are not supported yet.",
    noteSleep: "Deep-sleeping mice can't be read: move the mouse, then click 'Reload'. The app sends probe commands to reopen the channel automatically.",
    noteWired: "On cable, 0x0D (dongle firmware) reports 'not applicable'; wired polling rate is hardware-capped at 1000 Hz.",
    noteV1Stage: "On v1 the active stage can only be switched with the CPI button under the mouse — software changes are ignored by hardware.",
    noteRe: "The protocol was byte-verified against the official v1.02 configuration tool binary: command table, payload lengths, blob layout, two-chunk writes and retry timing all match; 0x71/0x72 (pair default / pair data) are new official commands, implemented here as well."
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
