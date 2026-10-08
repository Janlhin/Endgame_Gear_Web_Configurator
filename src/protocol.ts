// 协议常量
/* ================= 协议常量 =================
 *
 * Endgame Gear 目前有两套协议框架（详见 re/PROTOCOL_NOTES.md）：
 *
 *  A) 4k 族框架 —— 「0xA1 小报告(64B) + 0xA0 大报告(1041B) + 1024B blob @偏移16」
 *     · 4k 无线代（VID 0x3367）：13 条命令，有状态字节，4 档 CPI
 *     · 8k 有线代（VID 0x3367）：同框架（工具 v1.12 实证），命令表待穷举
 *     · XM1 / XM1 RGB（VID 0x22D4）：**同框架**，但只有 4 条命令、4 档 CPI；回报率为鼠标底部硬件拨动开关（250/500/1000 Hz），软件不可改
 *       （实测自官方 XM1 Configuration Software v1.09 二进制，见 re/XM1_NOTES.md）
 *
 *  B) 2020 有线/2.4G 族 —— 17B 帧 + 0x55 补码校验 + EEPROM（见 src/xm2we.ts）
 *     · XM2we / OP1we（VID 0x3367，usage page 0xFF02）
 *
 * 三族共用的 HID 通讯封装：SetFeature 失败于 {0x15,0x17,0x1D,0x57,0x65B}
 * 则 Sleep(50) 重试，最多 4 次（4k 工具与 XM1 主程序逐字节一致）。
 */

const VIDS = [0x3367, 0x22D4];

/* ---- 4k 族（VID 0x3367，VID 0x22D4 借用同一帧格式）---- */
const VID = 0x3367;
const VID_22D4 = 0x22D4;
const DONGLE_PID = 0x1970;

/* PID 表已对照官方 v1.02 工具二进制（0x17200 处的设备表：0x1982/0x1981 鼠标、0x1970/0x1969 接收器族，
   见 re/PROTOCOL_NOTES.md）；0x1968/0x1972/0x1984 来自 vole 社区逆向。 */
const MOUSE_PIDS: Record<number, [string, number]> = {
  0x1968: ["XM2w 4k", 1], 0x1972: ["OP1w 4k", 1], 0x1969: ["XM2w 4k (变体)", 1],
  0x1982: ["XM2w 4k v2", 2], 0x1984: ["OP1w 4k v2", 2], 0x1981: ["XM2w 4k v2 (变体)", 2],
};

/* XM1 的型号表单独一份（VID 0x22D4，与 4k 族区分）。
   PID 0x1803 与固件 REV 0x0229 来自真机枚举（2026-10-08），见 re/XM1_NOTES.md。 */
const XM1_PIDS: Record<number, [string, number]> = { 0x1803: ["XM1", 0] };

const RPT_CMD = 0xA1, RPT_BULK = 0xA0;
const POLLING_LABELS = { 0x02: "4000 Hz", 0x04: "2000 Hz", 0x08: "1000 Hz", 0x40: "125 Hz", 0x80: "1000 Hz" };

/* ---- XM1（2020 变体，VID 0x22D4）----
 * 实测自 XM1 Configuration Software v1.09（re/XM1_NOTES.md 第 3 节）：
 *   函数 RVA   报告头 dword   线上字节      长度
 *   0x40FA30   0x3A1          A1 03 00 00   64B    读 1 字节
 *   0x40FAE0   0x4A1          A1 04 00 00   64B    写 1 字节
 *   0x40FC80   0x7A1          A1 07 00 00   64B    写整块
 *   0x40FB90   0x8A0          A0 08 00 00   1041B  ★ 1024B blob @16
 * 与 4k 族的差异（2026-10-09 实测更正）：① **有**状态字节，位于 [1]，0x01 = 成功
 *   ② **4 档** CPI（与 4k 相同）。早前"无状态字节 / 3 档"是读错路径导致的误判
 *                ③ 无独立唤醒命令（0x0F 是 4k 无线专属）④ 不区分有无线
 * 仍待真机确认：blob 字段语义、命令 0x08 的子命令、blob↔内部布局重排层。 */
const XM1_MAX_STAGES = 4;   // 官方 UI 有 4 张 CPI 卡片（"range 1 to 3" 的旧文案已过时）
const XM1_SETTLE_MS = 80;     // 官方写后 Sleep(80)

/** 判断是否 XM1（2020 变体）：唯一依据是 VID 0x22D4 */
const isXm1 = (vendorId: number) => vendorId === VID_22D4;

/** 取型号名：XM1 走独立表，其余走 4k 表 */
function modelOf(vendorId: number, productId: number): string {
  if (isXm1(vendorId)) return (XM1_PIDS[productId] || ["XM1", 0])[0];
  return (MOUSE_PIDS[productId] || ["未知型号", 1])[0];
}

export { VIDS, VID, VID_22D4, DONGLE_PID, MOUSE_PIDS, XM1_PIDS, RPT_CMD, RPT_BULK, POLLING_LABELS,
         XM1_MAX_STAGES, XM1_SETTLE_MS, isXm1, modelOf };
