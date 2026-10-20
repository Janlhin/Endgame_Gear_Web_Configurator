// 界面按型号裁剪 —— 「连上什么设备，就只显示那个型号真正支持的设置」
//
// 设计原则（源自 2026-10-09 的用户反馈「看人下菜」）：
//   1. **不做「全部铺开 + 逐项禁用」**。禁用项对用户是噪声，也掩盖了
//      「这个型号本来就没有这项功能」这个事实。该隐藏的就隐藏。
//   2. **只显示已实测确认的字段**。偏移未定位的不出现 —— 否则会给出一个
//      「改了没反应」的控件，而这正是 XM1 的 XY 独立翻车的原因（先有控件、后发现固件不支持）。
//   3. **白名单式**：所有卡片与行都登记在 ALL_CARDS / ALL_ROWS，每次 applyLayout
//      都显式设置两者的可见性，不依赖上一次的状态 —— 避免切换设备时残留。
//      新增卡片或行必须同时登记，否则不会被切换（这是刻意的：宁愿漏登记被看见，也不要静默）。
import { t } from "./i18n.js";

/** 设备类别 —— 决定界面长什么样 */
type LayoutKind =
  /** 未连接：设备相关卡片全部收起 */
  | "none"
  /** 4k 无线 v1（XM2w 4k / OP1w 4k） */
  | "v1"
  /** 4k 无线 v2（XM2w 4k v2 / OP1w 4k v2） */
  | "v2"
  /** XM1（2020 有线，VID 0x22D4） */
  | "xm1"
  /** 未真机验证的型号（8k 族在写入路径出现之前用过；未知 PID 也落这里）：只读 */
  | "ro"
  /** 8k 有线族：读与 4k 同构、写走 0x11 整块写（用户手上无此设备，未真机验证） */
  | "8k"
  /** 第四协议族（XM1r / OP1 / OP1 RGB，usagePage 0xFFA1）：只识别型号，不通信 */
  | "unsupported"
  /** XM2we / OP1we：完全独立的一套卡片 */
  | "we";

/* 全部卡片（含 XM2we 专用四张） */
const ALL_CARDS = [
  "cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools",
  "cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools",
];

/* 全部可切换的行 / 单元格。
   .cell 是 `display: contents` 的包装 —— 在 flex 行里不占位，但能整组隐藏。 */
const ALL_ROWS = [
  "rowDongleFw", "rowBattery",                                     // 设备信息里不适用于有线的两行
  "rowStages", "rowLod", "cellGlass", "cellAngleSnap", "cellRipple",  // 传感器
  "cellLedLiftoff", "rowAngleTune",
  "rowPolling", "rowMotionSync", "rowSlamclick",                    // 性能 / 电源
  "rowV1Jitter", "rowV2Max", "rowV2Multi", "rowPower",
  "rowPairing",                                                     // 工具（配对 / 恢复出厂）
];

const CARDS_4K = ["cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools"];

const LAYOUT: Record<LayoutKind, { cards: string[]; rows: string[] }> = {
  none: { cards: [], rows: [] },

  /* v1：**没有**玻璃面模式、角度调校、强制最高 FPS、多击确认过滤（都是 v2 新增）；
     反过来 v2 没有「抖动过滤」（v1 专属）。这些差异来自 4k 族 blob 布局的逐字节核验。 */
  v1: {
    cards: CARDS_4K,
    rows: ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellAngleSnap", "cellRipple",
           "cellLedLiftoff",
           "rowPolling", "rowMotionSync", "rowSlamclick", "rowV1Jitter", "rowPower", "rowPairing"],
  },
  v2: {
    cards: CARDS_4K,
    rows: ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellGlass", "cellAngleSnap",
           "cellRipple", "cellLedLiftoff", "rowAngleTune",
           "rowPolling", "rowMotionSync", "rowSlamclick", "rowV2Max", "rowV2Multi", "rowPower", "rowPairing"],
  },

  /* XM1：只保留**已实测确认**的东西。
     · 保留：CPI 四档（单值）、Lift Cut-Off、Ripple —— 23 个字节全部经真机差分确认
     · 去掉：玻璃面 / 角度捕捉 / 抬离 LED / 角度调校（偏移未定位，官方 UI 有但不给控件）
     · 去掉整个「性能 / 电源」卡片：XM1 的回报率是**底部硬件拨动开关**，软件改不了
     · 去掉「按键映射」卡片：0x0C7 那个 7 项表只是**疑似**按键表，未做差分验证
     · 去掉接收器固件、电量两行：有线直连不存在这两个量 */
  xm1: {
    cards: ["cardInfo", "cardSensor", "cardTools"],
    /* 不显示「启用档位数 / 当前档位」：档数固定 4，激活档在表内用单选，两个下拉是噪声。
       LOD 要显示（偏移 0x046 已实测）；Ripple 要显示（0x057）；角度/灯效/玻璃面都没有。 */
    rows: ["rowLod", "cellRipple"],
  },

  /* 8k 有线族：可读可写。写入是**整块读-改-写**（0x11），未确认的字段一律保持读回原值。
     界面只放出「两个独立来源都确认过编码」的字段：
       ✓ CPI 四档（[xy][X u16][Y u16]，与 4k 逐字节相同）、档位数、当前档、
         LOD **不列**（family-specific 列表，编码未验证）、角度捕捉、波纹控制、
         回报率（divider 1/2/4/8 = 8000/4000/2000/1000 Hz）、Motion Sync、
         Slamclick、抖动过滤（flags bit0 / bit4）
       ✗ 玻璃面 / 抬离 LED / 角度调校 / 最大 FPS：8k 上是**能力位**或 V2 专属，
         偏移与 4k 不同（qsxcv: angleTune@128、maxFps@129，4k 在 0x01 与 flags 位），故不列
       ✗ 省电 / 深度休眠：8k 未见对应偏移定义
       ✗ 按键区：8k 从 0x3D 起 7 条（4k 是 0x37 起 8 条），另有 HANDED @0x37，未验证 */
  "8k": {
    cards: ["cardInfo", "cardSensor", "cardPerf", "cardTools"],
    rows: ["rowStages", "cellAngleSnap", "cellRipple",
           "rowPolling", "rowMotionSync", "rowSlamclick", "rowV1Jitter"],
  },

  /* 未真机验证的型号（当前无对应的产品；未知 PID 也落这里）：信息 + 传感器 + 导出，全部只读。
     保持这一档存在的意义：任何「协议已匹配但没验证过」的新型号默认都落到最保守的界面。 */
  ro: {
    cards: ["cardInfo", "cardSensor", "cardTools"],
    rows: ["rowDongleFw", "rowBattery", "cellAngleSnap", "cellRipple"],
  },

  /* 第四协议族（XM1r / OP1 / OP1 RGB）：只显示一张设备信息卡。
     它的协议是完全独立的第四套（64B 包 + 54 条 kCom* 命令 + 口令握手），
     本工具尚未实现 —— 列出来是为了让用户看到"已识别但不支持"，而不是空列表。 */
  unsupported: {
    cards: ["cardInfo"],
    rows: [],
  },

  /* XM2we / OP1we：2020 代是另一个协议族，界面也完全分开（17B 报告 + EEPROM 模型） */
  we: { cards: ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"], rows: [] },
};

const byId = (id: string) => document.getElementById(id);

/** 传感器表头随型号切换：XM1 是**单值** CPI（固件只读 X），4k 族是 XY 可独立。
 *  ★ 表头文本由本模块接管：摘掉 th 上的 data-i18n，否则 applyI18n() 会把它们
 *    重置回默认的「档位 / LED 颜色 / XY 独立 / CPI X / CPI Y」。
 *    语言切换时由 main.ts 调 reapplyLayout() 重建（走 t()，仍是双语的）。 */
function setSensorHeader(kind: LayoutKind) {
  const ths: any[] = Array.from(document.querySelectorAll("#cardSensor thead th"));
  if (!ths.length) return;
  const xm1Mode = kind === "xm1";
  const labels = xm1Mode
    ? [t("stage"), t("xm1On"), t("xm1ActiveCol"), "CPI " + t("xm1Single"), ""]
    : [t("stage"), t("ledColor"), t("xySplit"), "CPI X", "CPI Y"];
  ths.forEach((el, i) => {
    el.removeAttribute("data-i18n");
    if (labels[i] !== undefined) el.textContent = labels[i];
  });
  /* XM1 的 CPI 是单值，表体用 colspan=2 放一个输入框 —— 表头第 4 列也跨 2 列，
     否则会多出一个空列头。其它型号恢复成 5 个独立列头。 */
  ths[3].colSpan = xm1Mode ? 2 : 1;
  ths[4].style.display = xm1Mode ? "none" : "";
}

/** 当前生效的布局（语言切换时用它重建表头等由 t() 生成的文本） */
let CURRENT: LayoutKind = "none";

/** 按设备类别重排界面。任何时候都显式设置全部卡片与行，因此不存在状态残留。
 *
 *  ★ 卡片用 `data-off` 属性而不是内联 display：驾驶舱（cockpit.ts）要按「当前分区」
 *    再叠一层显示控制，两者若都写 style.display 会互相覆盖——属性让 CSS 统一裁决：
 *      [data-off]            → 该型号没有这张卡（layout 决定）
 *      .stage.tabbed > .card → 默认收起，只有 [data-active] 显示（cockpit 决定）
 */
function applyLayout(kind: LayoutKind) {
  CURRENT = kind;
  const L = LAYOUT[kind] || LAYOUT.none;
  for (const id of ALL_CARDS) {
    const el = byId(id);
    if (el) el.toggleAttribute("data-off", L.cards.indexOf(id) < 0);
  }
  for (const id of ALL_ROWS) {
    const el = byId(id);
    if (el) el.style.display = L.rows.indexOf(id) >= 0 ? "" : "none";
  }
  setSensorHeader(kind);

  /* 未连接时整块驾驶舱收起（只剩清单/致谢）；不再依赖卡片各自的 display。 */
  const cockpit = byId("cockpit");
  if (cockpit) cockpit.toggleAttribute("data-off", kind === "none");

  /* 通知驾驶舱重建导航：layout 只负责「有哪些卡」，导航由 cockpit.ts 生成。 */
  document.dispatchEvent(new CustomEvent("layoutchange", { detail: { kind } }));

  /* 工具卡片的持久化说明是 4k 专属的（提到 0x13），XM1 换成它自己的表述。
     同时改写 data-i18n，这样后续 applyI18n() 也不会把它换回去。 */
  const pn = byId("persistNote");
  if (pn) {
    const key = kind === "xm1" ? "xm1PersistNote" : "persistNote";
    pn.setAttribute("data-i18n", key);
    pn.textContent = t(key);
  }
}

/** 设备类别 → 界面类别。未知/未验证型号一律落到最保守的布局。 */
function layoutFor(opts: { xm1?: boolean; we?: boolean; eightK?: boolean; family4?: boolean;
                          unverified?: boolean; gen?: number | null }): LayoutKind {
  if (opts.family4) return "unsupported";
  if (opts.we) return "we";
  if (opts.xm1) return "xm1";
  if (opts.eightK) return "8k";
  if (opts.unverified) return "ro";
  return opts.gen === 1 ? "v1" : "v2";
}

/** 预览用：URL 里带 #layout=xm1 之类时直接套用该布局。
 *  用途：没有实机也能查看某个型号的界面裁剪效果（例如手上只有 XM2w 时看 XM1 长什么样），
 *  也便于回归验证。**不授予任何读写能力** —— 写入闸门只看「是否真的连接了设备」。 */
function applyLayoutFromHash(): boolean {
  const m = /(?:^|[#&])layout=([a-z0-9]+)/i.exec(location.hash || "");
  if (!m) return false;
  const k = m[1] as LayoutKind;
  if (["v1", "v2", "xm1", "ro", "we", "8k", "unsupported"].indexOf(k) < 0) return false;
  applyLayout(k);
  return true;
}

/** 语言切换后重建与文案相关的部分（表头由 t() 生成，applyI18n 不会碰它）。 */
function reapplyLayout() { applyLayout(CURRENT); }

export { applyLayout, layoutFor, applyLayoutFromHash, reapplyLayout };
export type { LayoutKind };
