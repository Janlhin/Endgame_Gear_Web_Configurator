import { errMsg } from "./err.js";
/** 4k 无线族（XM2w 4k / OP1w 4k 及 v2）的配置读取。
 *
 *  命令 0x12 请求 1024B blob；两种响应格式见下面的注释。
 *  XM1 分支转调 device-xm1（单向依赖，不构成环）。
 */
import { sleep, hex, log } from "./util.js";
import { S } from "./state.js";
import { rawReceive, guarded } from "./transport.js";
import { RPT_BULK } from "./protocol.js";
import { looksLikeBlob } from "./blob.js";
import { readBlobXm1 } from "./device-xm1.js";

export async function readBlob() {
  let lastDump = "";
  /* XM1 走**完全不同的路径**（官方函数 0x40FB90，反汇编实证）：
       memset(buf,0,0x411)              1041B 大报告
       mov dword [buf], 0x8A0           线上 A0 08 00 00
       buf[4]=0  buf[5]=子命令  buf[6..7]=0
       rep movsd (256 dword = 1024B)    blob → 报告偏移 16
       SetFeature(1041) → Sleep(80) → 再读一次 64B 状态报告
     所以它**不经过小报告命令通道**（没有"发 cmd → 读 status"这一轮），
     之前用 guarded(0x08) 走 transact 是错的 —— 那条路会撞上 4k 的状态字节判定。 */
  if (S.xm1) return readBlobXm1();

  for (let round = 1; round <= 4; round++) {
    await guarded(0x12, 0x00, null, { pace: 250 });
    for (let i = 0; i < 3; i++) {
      let u8;
      try { u8 = await rawReceive(RPT_BULK); }
      catch (e) { log(`✗ 读 0xA0 失败: ${errMsg(e)}`); await sleep(120); continue; }
      let status = u8[1], off = 16;
      if (u8[1] === 0xA1 && u8[2] === 0x01) { status = 0x01; off = 17; }  // v2 回显格式
      if (status === 0x01 && u8.length >= off + 1024) {
        const cand = u8.slice(off, off + 1024);
        if (looksLikeBlob(cand)) {
          S.blob = cand;
          log(`✓ blob read OK (${S.blob.length} B @off ${off}, round ${round})  head: ${hex(S.blob, 16)}`);
          return;
        }
        // 校验未过（疑似陈旧缓存）：按未就绪处理，继续重试
        lastDump = hex(cand, 32);
        log(`⋯ blob 校验未过 (levels=0x${cand[0x0E].toString(16)} polling=0x${cand[0x05].toString(16)}), round ${round}, head: ${lastDump}`);
        break;
      }
      if (status === 0x03) { log(`⋯ blob busy, retry #${i + 1}`); await sleep(280); continue; }
      lastDump = hex(u8, 32);
      log(`⋯ 0xA0 not ready (status=0x${u8[1].toString(16)}), round ${round}, head: ${lastDump}`);
      break;
    }
    await sleep(S.xm1 ? 200 : 300);
  }
  throw new Error(`blob read failed after 4 rounds; last head: ${lastDump}`);
}

