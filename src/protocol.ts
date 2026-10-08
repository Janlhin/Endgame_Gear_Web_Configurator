// 协议常量（依据 vole re/PROTOCOL.md）
/* ================= 协议常量（依据 vole re/PROTOCOL.md） ================= */
const VID = 0x3367;
const DONGLE_PID = 0x1970;
const MOUSE_PIDS = { 0x1968: ["XM2w 4k", 1], 0x1972: ["OP1w 4k", 1], 0x1982: ["XM2w 4k v2", 2], 0x1984: ["OP1w 4k v2", 2] };
const RPT_CMD = 0xA1, RPT_BULK = 0xA0;
const POLLING_LABELS = { 0x02: "4000 Hz", 0x04: "2000 Hz", 0x08: "1000 Hz", 0x40: "125 Hz", 0x80: "1000 Hz" };

export { VID, DONGLE_PID, MOUSE_PIDS, RPT_CMD, RPT_BULK, POLLING_LABELS };
