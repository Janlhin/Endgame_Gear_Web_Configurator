// 测试数据包导出：志愿者发回来的东西必须是"够用且不会漏项"的。
//
// 为什么要测：远程志愿者手里正是我们没有的型号，来回问一轮就要等一天。
// 数据包漏了 PID、接口集合或通讯日志，这份回报就白发了。
// 这里钉住的是"必填字段一定在"以及"任何字段缺失都不会让导出炸掉"。
import "./_domstub.js";
import { buildDiag, buildWeDiag } from "../src/diag.js";
import { S } from "../src/state.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

console.log("[1] 未连接任何设备时也必须能导出（不能抛异常）");
{
  S.dev = null; S.blob = null; S.mouseName = "—"; S.gen = null;
  S.eightK = S.xm1 = S.family4 = false; S.unverified = S.unknownModel = false;
  let d: any = null, err = "";
  try { d = buildDiag(); } catch (e: any) { err = String(e.message); }
  ok(!!d, "空状态导出不抛错", err);
  ok(d && d.schema === "diag/1" && !!d.savedAt, "带 schema 与时间戳");
  ok(d && d.blob === null, "没有 blob 时该字段为 null，不是 undefined/报错");
  ok(d && typeof d.report === "object" && "feltDifferent" in d.report, "回报模板含「手感是否真变」这一项");
}

console.log("\n[2] 8k 设备：型号判据必须齐全");
{
  S.dev = { productName: "OP1 8k v2", vendorId: 0x3367, productId: 0x1978,
            collections: [{ usagePage: 0xFF01, usage: 0x02 }] } as any;
  S.eightK = true; S.mouseName = "OP1 8k v2"; S.gen = null;
  S.blob = new Uint8Array(1024); S.blob[0x0E] = 4;
  const d: any = buildDiag();
  ok(d.device.productId === 0x1978 && d.device.vendorId === 0x3367, "VID / PID 在包里");
  ok(d.device.family === "8k-wired" && d.flags.eightK === true, "族判定 = 8k-wired");
  ok(Array.isArray(d.device.collections) && d.device.collections[0].usagePage === 0xFF01,
     "接口集合（usage page）在包里 —— 这是判族的第一手依据");
  ok(!!d.blob && d.blob.length === 1024 && !!d.blob.b64 && !!d.blob.hex, "blob 同时给出 base64 与 hex");
  ok(typeof d.log === "string", "通讯日志字段存在（无 DOM 时为空串）");
}

console.log("\n[3] WE 族：额外带 EEPROM 转储与解码表");
{
  const fakeSess: any = {
    mem: new Map([[0x00, 0x01]]),
    cpiTable: () => [{ slot: 1, x: 800, y: 800 }],
    keyTable: () => [], polling: () => 1000, debounce: () => 8,
    ledColors: () => [], dumpHex: () => "0000: 01 54",
  };
  const d: any = buildWeDiag(fakeSess, "XM2we (wired)");
  ok(!!d.we && d.we.model === "XM2we (wired)", "we.model 在包里");
  ok(d.we.tables && d.we.tables.pollingHz === 1000, "解码后的回报率在包里");
  ok(d.we.dumpHex === "0000: 01 54", "EEPROM 转储在包里");
}

console.log("\n[4] 部分字段缺失不得让导出失败");
{
  S.dev = { productName: "?", vendorId: 0x3367, productId: 0x1982 } as any;  // 无 collections
  S.blob = null; (S as any).stage = null;
  let d: any = null, err = "";
  try { d = buildDiag(); } catch (e: any) { err = String(e.message); }
  ok(!!d, "stage 缺失也能导出", err);
  ok(d && d.parsed && d.parsed.cpi === null, "parsed.cpi 缺失时为 null");
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);
