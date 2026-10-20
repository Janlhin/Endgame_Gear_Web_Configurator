/** 共享可变状态。
 *
 *  从 main.ts 拆出来（原本 1678 行、12 个职责混在一起）。这些量被传输层、
 *  各设备族、渲染层共同读写，集中在一处才能让各模块互相引用而不形成环。
 *
 *  ⚠️ 为什么用对象包装（`S.xxx`）而不是 `export let dev`：
 *  ES module 的**导入绑定是只读的** —— 导入方不能给 `dev` 赋值，而这些状态
 *  恰恰要被写入。对象属性没有这个限制。所以统一 `S.xxx`，也让「跨模块状态」
 *  在代码里一眼可辨。
 *
 *  ⚠️ 改名时注意：日志文案里也出现 blob / stage 等词，
 *  批量替换必须跳过字符串与注释（见 re/_rename.mjs 的词法扫描）。
 */

/** 按键表的一条记录：type/代码/键位/过滤，对应 blob 偏移 0x37 + 7n 起每条 7 字节。 */
export interface StageButton {
  type: number;
  code: number;
  key: number;
  filter: number;
}

/** 电源类字段的取值：分钟数，或 "off"（blob 第 7 位为 1 时表示关闭）。
 *  见 blob.ts 的 `if (b[0x03] & 0x80) s.deepSleep = "off"`。 */
export type MinutesOrOff = number | "off";

/** 界面模型：从设备读回、可被编辑、可写回的一整套设置。
 *
 *  ⚠️ 这里同时容纳**已核实字段**与**未核实字段**，是有意的：
 *  XM1（VID 0x22D4）的blob 布局与 4k 族同构，但字段语义尚未逐字节核实
 *  ——官方内部布局与线上布局之间还有一层重排（函数 0x40FD60，298 条搬运）。
 *  因此 blob.ts 对 XM1 只做「不猜」的解析：把raw 原样带出并标 unknown，
 *  绝不按 4k 的偏移猜测并回写。字段清单见 re/PROTOCOL_NOTES.md。
 *
 *  换句话说：`raw` 与 `unknown` 是**安全机制的载体**，不是遗留代码。
 *  它们让 UI 能切到只读视图（见render.ts 对 unknown 的处理），
 *  也让 buildSensorPayload 不敢碰未核实的偏移。删掉它们等于拆掉安全网。 */
export interface Stage {
  /** CPI 四档：[启用, X, Y]。XM1 固件只读 X、忽略 Y，故X/Y 同步。 */
  cpi: number[][];
  /** 档位数量（XM1 为 4，4k 族读 blob[0x0E] 且钳在 1..4）。 */
  levels: number;
  /** 当前激活档的索引。 */
  active: number;

  /** LOD 的毫米值（用户语义，UI 直接显示）。`lod` 是同一配置的字节值。 */
  lodMM: number;
  /** LOD 字节值（写入路径用）。0x21 偏移，含 glass 模式的重排。 */
  lod: number;
  /** 玻璃模式标志：影响 LOD 与 DPI 的换算（见 mmToLodByte / lodByteToMm）。 */
  glass: number;

  angleSnap: number;
  /** 角度调校。**原样透传读到的值**，不接受 UI 编辑 —— 语义未确认。
   *  见 buildSensorPayload 对 p[5] 的注释。 */
  angleTune: number;
  ripple: number;
  ledLiftoff: number;
  motionSync: number;
  /** 回报率枚举值。注意：XM1 的回报率是鼠标底部硬件开关，软件改不了。 */
  polling: number;
  /** 标志位原值（blob[0x06]）。写入路径用它组装，下面四个开关都从它派生。 */
  flags: number;

  /* —— 以下 4 个是 UI 层的布尔开关，不是 blob 里的独立字段——
   *  它们由 flags 的位派生（render.ts 的 `S.stage.x = !!(S.stage.flags &掩码)`），
   *  写入时再由 buildBlob8k / buildSensorPayload 组装回 flags。
   *  只在 v1 / v2 上生效，故 render.ts 与 buildBlob8k 里都有 S.gen 的条件判断。 */

  /* 这四个是布尔开关：写入侧只用真假判断（`if (S.stage.slamclick) f |= 1`），
     赋0/1 与赋 true/false 运行时等价。但 UI 层（render.ts / main.ts）统一写
     `!!(flags &掩码)`，故类型是 boolean 而非 number —— 之前声明成number
     是错的，收敛 S 时被tsc 抓了出来。 */
  /** Slamclick 过滤（flags & 0x01）。 */
  slamclick?: boolean;
  /** 抖动过滤（flags & 0x10），**仅 v1（4k 一代）有**。 */
  jitter?: boolean;
  /** 强制最高传感器 FPS（flags & 0x40），**仅 v2 有**。 */
  maxFps?: boolean;
  /** 多击确认过滤（flags & 0x20），**仅 v2 有**。 */
  multiclick?: boolean;

  powerSaving: MinutesOrOff;
  deepSleep: MinutesOrOff;
  filters: number[];

  buttons: StageButton[];

  /* —— 以下为未核实字段，仅在「已核实字段不适用」的族里出现 —— */

  /** blob[0x07]：0x14 帧透传的未知标志。官方工具原样回写，勿清零。 */
  unk7?: number;
  /** XM1 专用：原始 blob 整体带出，供界面显示与导出对照。绝不按偏移猜测。 */
  raw?: Uint8Array;
  /** 标记「字段语义未核实」→ UI 必须转只读视图。
   *  置位即禁止一切写入路径（见 render.ts 与写入闸门）。 */
  unknown?: boolean;
}

/** XM1 的单档（CPI 一档）。布局为 [启用][填充][X][Y] 共 6 字节，
 *  **没有** 4k 族那样的 XY 使能字段。
 *  ⚠️ XM1 固件只读 X、忽略 Y（2026-10-09 真机实测：改 X 有效果、改 Y 没效果），
 *  因此写入时把 Y 也设成 X—— 见 xm1PatchEdit。 */
export interface Xm1Stage {
  idx: number;
  /** 启用位：blob 值等于 XM1_STAGE_ON（0x01）为启用，0xFF 为禁用。
   *  注意不是布尔——协议里 0x01 表示开、0xFF 表示关。 */
  on: boolean;
  x: number;
  y: number;
}

/** XM1 的编辑状态：xm1Parse 从 blob 解析出的可编辑子集。
 *
 *  与 `Stage` 的差别：这是**协议层**的形状（按 XM1 的 6 字节档位布局），
 *  而 Stage 是界面视图。XM1 的字段偏移表见 blob.ts 的 XM1_F。 */
export interface Xm1Edit {
  active: number;
  lodRaw: number;
  lodMM: number;
  ripple: number;
  stages: Xm1Stage[];
}

/** 界面模型：从设备读回、可被编辑、可写回的一整套设置。 */
export function newStage(): Stage {
  return {
    cpi: [[0, 400, 400], [0, 800, 800], [0, 1600, 1600], [0, 3200, 3200]], levels: 4, active: 1,
    lod: 3, lodMM: 1.0, glass: 0, angleSnap: 0, ripple: 0, angleTune: 0, ledLiftoff: 1,
    motionSync: 0, polling: 0x08, flags: 0, powerSaving: 1, deepSleep: 3,
    filters: [8, 8, 8, 8, 8], buttons: [],
  };
}

/** 全局状态。**类型如实反映现状，不做美化**——
 *  `dev` / `blob` / `gen` / `xm1LastRead` 都可能是 null（设备未连接 / 未读取），
 *  调用方必须自己判空。此前 S 是 any，上述空值假设全无检查；
 *  收敛后暴露的 50 个错误里绝大多数正是这类「本来就该判空却没判」的地方，
 *  属于**修好而非添麻烦**。 */
export interface GlobalState {
  /* —— 传输层 —— */
  /** 已打开的 HIDDevice。未连接时为 null——所有报文发送前必须判空。 */
  dev: HIDDevice | null;
  /** 事务串行队列。串成一条链，保证 HID 报文不并发（见 transport.ts）。 */
  queue: Promise<void>;
  /** 写入互斥：一次 apply / 导入从「发第一份报文」到「回读校验结束」期间为 true。
   *  重复点击或并发入口（导入 vs 应用）在此期间直接拒绝，避免两次写入交错
   *  造成设备停在半应用状态（2026-10-20 审计）。只读刷新不受限。 */
  writing: boolean;
  /** 上次事务失败 → 下次先 probe。 */
  lastFail: boolean;

  /* —— 设备识别 —— */
  mouseName: string;
  /** 4k 族代数（1/ 2），**null = 未知**，0 也可能出现（见 connect.ts 的识别逻辑）。
   *  渲染时以 `v${gen}` 展示、并传给 cpiInputBounds() 决定 CPI 步进。 */
  gen: number | null;
  eightK: boolean;
  family4: boolean;
  xm1: boolean;
  wired: boolean;
  /** 仅静态实证、未真机验证 → 只读。 */
  unverified: boolean;
  /** PID 未收录 → 只读。 */
  unknownModel: boolean;
  /** 未验证型号的「实验写入」开关：默认关，用户点确认后才在本次连接内打开。
   *  随设备丢失 / 复位一起清掉（见 presence.resetToInitial），绝不跨会话保留。 */
  betaArmed: boolean;

  /* —— 从设备读回的数据 —— */
  /** 1024B 配置。**未读取时为 null** —— blob.ts / buildSensorPayload 的
   *  每一处 `b[i]` 都依赖调用方先判空。 */
  blob: Uint8Array | null;
  /** 8k：最近一次完整 1041B 报告帧。 */
  lastFrame: Uint8Array | null;
  /** 该帧的配置是否确实起于报告偏移 16。 */
  frameAligned: boolean;
  dongleFw: string;
  mouseFw: string;
  battery: number | null;

  /* —— 界面模型（stage 是 UI 的单一数据源） —— */
  stage: Stage;

  /* —— XM1 写入闸门 —— */
  /** 只允许「回声」这一份。未读取时 null。 */
  xm1LastRead: Uint8Array | null;
  /** 是否处于一次明确的写回测试中。 */
  xm1Armed: boolean;
  xm1Edit: Xm1Edit | null;
  /** 快照：每次成功读取、以及每次写入前各存一份，最多 20 份，支持一键回退。 */
  xm1Snaps: { at: number; label: string; blob: Uint8Array }[];
}

/** 取当前配置 blob，**未读取过则抛**。
 *
 *  典型用法是「readBlob() 刚成功，紧接着解析/构造报文」——
 *  那条路径上 S.blob 必然非空。此前 S 是 any，这类假设完全没被检查；
 *  收敛后暴露出的 4 处 TS2345 全是这个模式。
 *
 *  同样用抛而不用静默兜底：读不到配置却继续往下走，
 *  会把一份空/过期的 blob 写回设备 —— 那正是配置被清零的成因。 */
export function blob(): Uint8Array {
  if (!S.blob) throw new Error("尚未成功读取过配置");
  return S.blob;
}

export const S: GlobalState = {
  /* —— 传输层 —— */
  dev: null,                                    // 已打开的 HIDDevice
  queue: Promise.resolve(),                // 事务串行队列
  writing: false,                          // 写入互斥（apply / 导入期间为 true）
  lastFail: false,// 上次事务失败 → 下次先 probe

  /* —— 设备识别 —— */
  mouseName: "—",
  gen: null,                                    // 4k 族代数 1/2（null = 未知）
  eightK: false,                               // 8k 有线族
  family4: false,                              // 第四协议族（只识别、不通信）
  xm1: false,                                  // XM1 / XM1 RGB
  wired: false,
  unverified: false,                           // 仅静态实证、未真机验证 → 只读
  unknownModel: false,                         // PID 未收录 → 只读
  /* 未验证型号的"实验写入"开关：**默认关**，用户点确认后才在本次连接内打开。
     随设备丢失 / 复位一起清掉（见 presence.resetToInitial），绝不跨会话保留。 */
  betaArmed: false,

  /* —— 从设备读回的数据 —— */
  blob: null,                // 1024B 配置
  lastFrame: null,                // 8k：最近一次完整 1041B 报告帧
  frameAligned: false,                         // 该帧的配置是否确实起于报告偏移 16
  dongleFw: "—", mouseFw: "—",
  battery: null,

  /* —— 界面模型（stage 是 UI 的单一数据源） —— */
  stage: newStage(),

  /* —— XM1 写入闸门 —— */
  xm1LastRead: null,              // 只允许「回声」这一份
  xm1Armed: false,                             // 是否处于一次明确的写回测试中
  xm1Edit: null,
  xm1Snaps: [],
};
