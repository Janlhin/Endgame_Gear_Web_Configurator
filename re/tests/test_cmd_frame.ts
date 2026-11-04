import "../_domstub.js";                 // transport 会间接拉入 util（import 期就碰 window）
import assert from "node:assert/strict";
import { buildCmdFrame } from "../../src/transport.js";

/* 4k 族的命令报文布局（63 字节，不含 reportId）：
 *   [0]=命令  [1]=目标  [2]=声明长度  [3..4]=0  [5]=块号  [15..]=载荷
 *
 * 块号为什么在 [5]：官方工具把块号写在「报告偏移 6」，而本项目把「报告偏移」
 * 算上 reportId 那个字节（见 transport.ts 上方「报告内偏移 16 = 去掉 ID 后的 15」），
 * 去掉 reportId 就是 5；OpenMouse 的块写头部 `[0x0f, len, 0, 0, chunk]` 落点相同。
 * 2026-11-04 之前这里写的是 [6]（多空一格），这条断言就是防它回退。
 */
const payload = new Uint8Array(28).fill(0xaa);
const f = buildCmdFrame(0x16, 0x0f, payload, { lenByte: 0x1c, chunk: 2 });

assert.equal(f.length, 63, "报文长度必须是 63（WebHID 的 data 不含 reportId）");
assert.equal(f[0], 0x16, "[0] 命令");
assert.equal(f[1], 0x0f, "[1] 目标");
assert.equal(f[2], 0x1c, "[2] 声明长度");
assert.equal(f[3], 0x00, "[3] 必须为 0");
assert.equal(f[4], 0x00, "[4] 必须为 0");
assert.equal(f[5], 2, "[5] 必须是块号");
assert.equal(f[6], 0x00, "[6] 必须仍是 0 —— 块号错放在这里过一次");
assert.equal(f[15], 0xaa, "载荷从 [15] 起");
assert.equal(f[42], 0xaa, "载荷末尾 = 15 + 27");

/* 不给块号时 [5] 保持 0（传感器/性能块都是整块，无 chunk） */
const g = buildCmdFrame(0x14, 0x0f, payload, {});
assert.equal(g[5], 0, "无 chunk 时 [5] 为 0");
assert.equal(g[2], 28, "未给 lenByte 时用 payload 长度");

/* v1 的电源块只有 10 字节：声明长度与载荷长度都要能各自独立给出 */
const h = buildCmdFrame(0x15, 0x0f, payload.slice(0, 10), { lenByte: 0x0a });
assert.equal(h[2], 0x0a, "声明长度由 lenByte 决定");
assert.equal(h[24], 0xaa, "第 10 个载荷字节落在 [15+9]");
assert.equal(h[25], 0x00, "[15+10] 保持 0（v1 不发第 11 字节）");

console.log("test_cmd_frame: OK");
