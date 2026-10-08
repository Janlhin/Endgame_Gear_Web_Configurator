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

/** 界面模型：从设备读回、可被编辑、可写回的一整套设置。 */
export function newStage() {
  return {
    cpi: [[0, 400, 400], [0, 800, 800], [0, 1600, 1600], [0, 3200, 3200]], levels: 4, active: 1,
    lod: 3, lodMM: 1.0, glass: 0, angleSnap: 0, ripple: 0, angleTune: 0, ledLiftoff: 1,
    motionSync: 0, polling: 0x08, flags: 0, powerSaving: 1, deepSleep: 3,
    filters: [8, 8, 8, 8, 8], buttons: [],
  };
}

export const S: any = {
  /* —— 传输层 —— */
  dev: null as any,                            // 已打开的 HIDDevice
  queue: Promise.resolve() as Promise<any>,    // 事务串行队列
  lastFail: false,                             // 上次事务失败 → 下次先 probe

  /* —— 设备识别 —— */
  mouseName: "—",
  gen: null as any,                            // 4k 族代数 1/2（null = 未知）
  eightK: false,                               // 8k 有线族
  family4: false,                              // 第四协议族（只识别、不通信）
  xm1: false,                                  // XM1 / XM1 RGB
  wired: false,
  unverified: false,                           // 仅静态实证、未真机验证 → 只读
  unknownModel: false,                         // PID 未收录 → 只读

  /* —— 从设备读回的数据 —— */
  blob: null as Uint8Array | null,             // 1024B 配置
  lastFrame: null as Uint8Array | null,        // 8k：最近一次完整 1041B 报告帧
  frameAligned: false,                         // 该帧的配置是否确实起于报告偏移 16
  dongleFw: "—", mouseFw: "—",
  battery: null as number | null,

  /* —— 界面模型（stage 是 UI 的单一数据源） —— */
  stage: newStage(),

  /* —— XM1 写入闸门 —— */
  xm1LastRead: null as Uint8Array | null,      // 只允许「回声」这一份
  xm1Armed: false,                             // 是否处于一次明确的写回测试中
  xm1Edit: null as any,
  xm1Snaps: [] as { at: number; label: string; blob: Uint8Array }[],
};
