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
   见 re/PROTOCOL_NOTES.md）；0x1968/0x1972/0x1984 来自 vole 社区逆向。

   ★ 8k 有线族的 PID 来自官方工具二进制的设备匹配常量
     （x86 `push 0x3367` + `push 0x<PID>`，扫描脚本 re/upstream/tool8k_pids.py）：
       XM2 8k     = 0x1966   OP1 8k     = 0x1964   （工具 v1.12，两者只差这 1 个常量）
       XM2 8k v2  = 0x1980   OP1 8k v2  = 0x1978   （工具 v1.07）
     限定/变体共用工具 → 同 PID：OP1 8k Purple Frost = 0x1964、OP1 8k v2 Raw Input = 0x1978。

   ★ 第三个元素 verified=0 表示「未在真机验证」：只允许读取，写入被禁用。

   ⚠️ 8k 族**不只是缺 PID**（2026-10-09 用社区实现交叉验证后修正）：
     · 读取可复用 —— 8k 的 LOAD 也是 `0x12` + `0xA1`，与 4k 相同
     · **写入不同** —— 8k 是 `0x11` 整块写出（官方工具与社区 qsxcv/egctl 一致），
       而 4k 是 `0x14/0x15/0x16` 分块写 → 写入路径必须另行实现，不能套用
     · **按键区布局不同** —— 8k 为 7 个按键记录、起点比 4k（`0x37`）晚 6 字节（`0x3D`）
     · **gen 模型不适用** —— 8k 的 LOD 是 1/2mm（同 gen1），却同时带 glass / max-FPS
       （gen2 特征）。下面填的 1/2 只是"让 UI 有值可用"的近似，**别当真**。
   其余字段偏移（LOD `0x09`、angle `0x0A`、ripple `0x0B`、motionSync `0x0C`、
   levels `0x0E`、CPI `0x23+5n` 的 `[xy][X][Y]`、glass `0x6F`）经 egctl 与
   官方工具二进制**双向印证，与 4k 完全一致**，见 re/upstream/SOURCES.md。 */
const MOUSE_PIDS: Record<number, [string, number, number?]> = {
  0x1968: ["XM2w 4k", 1], 0x1972: ["OP1w 4k", 1], 0x1969: ["XM2w 4k (变体)", 1],
  0x1982: ["XM2w 4k v2", 2], 0x1984: ["OP1w 4k v2", 2], 0x1981: ["XM2w 4k v2 (变体)", 2],
  0x1966: ["XM2 8k", 1, 0], 0x1964: ["OP1 8k / Purple Frost", 1, 0],
  0x1980: ["XM2 8k v2", 2, 0], 0x1978: ["OP1 8k v2 / Raw Input", 2, 0],
};

/* XM1 的型号表单独一份（VID 0x22D4，与 4k 族区分）。
   PID 0x1803 与固件 REV 0x0229 来自真机枚举（2026-10-08），见 re/XM1_NOTES.md。 */
const XM1_PIDS: Record<number, [string, number]> = { 0x1803: ["XM1", 0] };

const RPT_CMD = 0xA1, RPT_BULK = 0xA0;

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

/* ---- XM1 写入报文的构造与校验（同一个源头，避免两处偏移写不一致）----
 *
 * 官方写 blob（0x40FB90）逐指令确证的几何关系：
 *   报告长度 0x411 = 1041 字节（Windows 约定 buf[0] 是 reportId）
 *     report[0]        = 0xA0        reportId
 *     report[1]        = 0x08        命令码
 *     report[2..3]     = 0
 *     report[4]        = 0
 *     report[5]        = 入参 = blob[0]（解析器 0x40E550 把缓冲区第 0 字节写进 obj+4）
 *     report[6..7]     = 0
 *     report[16..1039] = 1024B 载荷（16 + 1024 = 1040）
 *     report[1040]     = 0           memset 留下的尾巴
 *   WebHID 的 sendFeatureReport(reportId, data) 中 **data 不含 reportId**，
 *   故 data = report[1..1040]，长度 1040，且 data[i] === report[i + 1]：
 *     data[0]=0x08  data[1..2]=0  data[3]=0  data[4]=blob[0]  data[5..6]=0
 *     载荷落在 data[15..1038]（1024 字节），data[1039] = 0
 *   ★ 我曾在校验里写 `data.subarray(15)`（= data[15..1039]，1025 字节），
 *     比载荷多出一位，恒判失败 —— 所以这里把两者做成一对函数并配单元测试。
 */
const XM1_BLOB_DATA_LEN = 1040;              // WebHID 载荷长度（报告 1041 − reportId）
const XM1_PAYLOAD_OFF_IN_DATA = 15;          // 载荷在 data 中的起点（= 报告偏移 16 − 1）

/** 构造 XM1「写 blob」的 WebHID 载荷（1040 字节，不含 reportId）。 */
function buildXm1BlobReport(payload: Uint8Array): Uint8Array {
  if (payload.length !== 1024) throw new Error("XM1 载荷必须是 1024 字节");
  const data = new Uint8Array(XM1_BLOB_DATA_LEN);   // 全零，与官方 memset 后一致
  data[0] = 0x08;                                   // 命令码
  data[4] = payload[0];                             // buf[5] = blob[0]
  data.set(payload, XM1_PAYLOAD_OFF_IN_DATA);       // data[15..1038]
  return data;
}

/** 构造 XM1「写单字节」的 WebHID 载荷（63 字节，不含 reportId）。 */
function buildXm1ByteReport(value: number): Uint8Array {
  const b = new Uint8Array(63);
  b[0] = 0x04;            // 命令码
  b[3] = 0x00;            // buf[4]
  b[4] = value & 0xFF;    // buf[5] = 值
  return b;
}

/** 无负载查询（cmd 0x03 读字节 / cmd 0x07 读 blob）：63B，除命令码外全零。 */
function xm1GuardQuery(reportId: number, data: unknown): boolean {
  return reportId === RPT_CMD && data instanceof Uint8Array && data.length === 63
    && (data[0] === 0x03 || data[0] === 0x07)
    && data.every((b, i) => (i < 1 ? true : b === 0));
}

/* ★ XM1 允许写入的字节偏移 —— **只包含真机差分实测确认过的字段**。
 * 其余 1001 个字节在任何情况下都必须与刚读回的数据逐字节相同。
 * 这张表是写入安全的最后一道边界：宁可改不了，也不能改错。
 *
 * 依据（re/XM1_NOTES.md 6.7 节，四次受控差分）：
 *   0x032 激活档索引 | 0x033/0x03C/0x051/0x05B 四档启用位
 *   0x034-0x037 / 0x03D-0x040 / 0x052-0x055 / 0x05C-0x05F 四档 X/Y（u16 LE）
 *   0x046 Lift Cut-Off（5×mm−4） | 0x057 Ripple Control
 * 注意 **不含 blob[0]**：它的含义未确认，且它是 buf[5] 与 cmd 0x04 的来源，
 * 必须保持原值。 */
const XM1_EDITABLE_OFFSETS: readonly number[] = [
  0x032,
  0x033, 0x034, 0x035, 0x036, 0x037,
  0x03C, 0x03D, 0x03E, 0x03F, 0x040,
  0x046,
  0x051, 0x052, 0x053, 0x054, 0x055,
  0x057,
  0x05B, 0x05C, 0x05D, 0x05E, 0x05F,
];
const XM1_EDITABLE_SET = new Set<number>(XM1_EDITABLE_OFFSETS);

/** 回声写 blob → 升级为「受限编辑写 blob」：除已核实字段外必须逐字节等于 ref。
 *  无任何差异时即等价于原样回声（所以回声测试走的也是这条）。 */
function xm1GuardWrite(reportId: number, data: unknown, ref: Uint8Array | null,
                       editable: ReadonlySet<number> = XM1_EDITABLE_SET): boolean {
  if (reportId !== RPT_BULK || !(data instanceof Uint8Array) || !ref) return false;
  if (data.length !== XM1_BLOB_DATA_LEN || ref.length !== 1024) return false;
  if (data[0] !== 0x08) return false;                                // 命令码必须是 08
  if (data[1] !== 0 || data[2] !== 0 || data[3] !== 0) return false;   // buf[2..4] = 0
  if (data[5] !== 0 || data[6] !== 0) return false;                    // buf[6..7] = 0
  if (data[1039] !== 0) return false;                                  // memset 尾巴
  if (data[4] !== ref[0]) return false;          // blob[0] 不可改 ⇒ buf[5] 恒等于 ref[0]
  for (let i = 0; i < 1024; i++) {
    const v = data[XM1_PAYLOAD_OFF_IN_DATA + i];
    if (v === ref[i]) continue;
    if (!editable.has(i)) return false;          // ★ 未核实字段一律不许动
  }
  return true;
}

/** 写单字节（cmd 0x04）依旧只允许回声：blob[0] 不在可编辑集合内。 */
function xm1GuardEchoByte(reportId: number, data: unknown, ref: Uint8Array | null): boolean {
  if (reportId !== RPT_CMD || !(data instanceof Uint8Array) || !ref) return false;
  if (data.length !== 63 || data[0] !== 0x04) return false;
  if (data[3] !== 0 || data[4] !== ref[0]) return false;
  return data.every((b, i) => (i === 0 || i === 4 ? true : b === 0));
}

export { VIDS, VID, VID_22D4, DONGLE_PID, MOUSE_PIDS, XM1_PIDS, RPT_CMD, RPT_BULK,
         XM1_MAX_STAGES, XM1_SETTLE_MS, isXm1, modelOf,
         XM1_BLOB_DATA_LEN, XM1_PAYLOAD_OFF_IN_DATA,
         buildXm1BlobReport, buildXm1ByteReport,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte, XM1_EDITABLE_OFFSETS };
