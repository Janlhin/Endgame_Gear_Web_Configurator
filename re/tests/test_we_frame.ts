import assert from "node:assert/strict";
import { buildFrame, ck, FRAME_LEN, RPT_OUT } from "../../src/xm2we.js";

// 帧布局（官方配置工具反汇编结论，见 re/upstream/xm2we_PROTOCOL.md）：
//   [0]=report id 0x08  [1]=opcode  [2]=保留  [3..4]=地址 BE16
//   [5]=数据长度  [6..15]=数据  [16]=校验
// payload 从 [3] 起落位，所以 EEPROM 命令的 payload 就是 [hi, lo, len, ...data]，
// 调用方不要再加前导 0x00。
const f = buildFrame(0x08, [0x01, 0x2c, 10]);

assert.equal(f.length, FRAME_LEN, "帧长必须 17");
assert.equal(f[0], RPT_OUT, "[0] 是 report id");
assert.equal(f[1], 0x08, "[1] 是 opcode");
assert.equal(f[2], 0x00, "[2] 保留为 0");
assert.equal(f[3], 0x01, "[3] 必须是地址高字节");
assert.equal(f[4], 0x2c, "[4] 必须是地址低字节");
assert.equal(f[5], 10, "[5] 必须是数据长度");
assert.equal(f[16], ck(...Array.from(f.slice(0, 16))), "[16] 是前 16 字节的 0x55 补码");
assert.equal(
  Array.from(f).reduce((a, b) => a + (b & 0xff), 0) & 0xff,
  0x55,
  "整帧和必须 ≡ 0x55（设备的校验判据）",
);

// 回归：曾经在调用方多塞一个前导 0x00，导致地址/长度整体后移一字节 ——
// 设备把长度读成 0，直接不回应，表现为「EEPROM read timed out at 0x000」。
// 这里锁死「长度落在 [5]」，任何人再引入前导字节都会失败。
const shifted = buildFrame(0x08, [0x00, 0x01, 0x2c, 10]);
assert.equal(shifted[5], 0x2c, "带前导 0x00 时 [5] 会退化成地址低字节——这正是旧 bug");

// 无 payload 的命令（链路 0x03 / 电量 0x04）本就合法，修复不应影响它们
const plain = buildFrame(0x04);
assert.equal(plain[1], 0x04);
assert.equal(plain[3], 0x00);
assert.equal(
  Array.from(plain).reduce((a, b) => a + (b & 0xff), 0) & 0xff,
  0x55,
  "无 payload 的帧也必须满足整帧和 ≡ 0x55",
);
