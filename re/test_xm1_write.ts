// XM1 写入报文的离线回归测试。
//
// 由来：回声写入第一次跑真机时被自己的白名单拦下了，原因是校验里
//   data.subarray(15) 得到 1025 字节（多含 data[1039]），与只有 1024 字节的
//   基准逐字节比较必然失败。构造与校验分处两个文件、各写一份偏移，是这类错误的温床。
// 现在两者都来自 protocol.ts 的同源函数，并由本文件覆盖：
//   ① 报文的几何关系（长度 / 头部 / 载荷落位 / 尾巴）
//   ② 「自己构造的报文必须能过自己的校验」（这条就是当初能抓到 bug 的断言）
//   ③ 一切变形都必须被拦截
import { XM1_EDITABLE_OFFSETS as _OFF0 } from "../src/protocol.js";
import { buildXm1BlobReport, buildXm1ByteReport,
         xm1GuardQuery, xm1GuardWrite, xm1GuardEchoByte, XM1_EDITABLE_OFFSETS,
         RPT_CMD, RPT_BULK, XM1_BLOB_DATA_LEN, XM1_PAYLOAD_OFF_IN_DATA } from "../src/protocol.js";

const XM1_EDITABLE_SET_has0 = (() => {
  const s = new Set<number>(_OFF0); return s.has(0);
})();

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

// 合成的基准配置（含一个非零首字节，用于检验 buf[5]）
const ref = new Uint8Array(1024);
ref[0] = 0x11;
ref[0x34] = 0x90; ref[0x35] = 0x01;    // CPI1 X = 400
ref[0x57] = 1;                          // Ripple On

console.log("[1] 写 blob 报文的几何关系（对应官方 0x40FB90）");
{
  const d = buildXm1BlobReport(ref);
  ok(XM1_BLOB_DATA_LEN === 1040, "data 长度常量 = 1040（报告 1041 减 reportId）");
  ok(d.length === 1040, "构造结果长度 1040");
  ok(d[0] === 0x08, "命令码 = 0x08");
  ok(d[1] === 0 && d[2] === 0 && d[3] === 0, "buf[2..4] = 0");
  ok(d[4] === ref[0], "buf[5] = blob[0]（官方传的就是 obj[4]）");
  ok(d[5] === 0 && d[6] === 0, "buf[6..7] = 0");
  ok(d[1039] === 0, "data[1039] = 0（对应报告 [1040]，memset 的尾巴）");
  ok(XM1_PAYLOAD_OFF_IN_DATA === 15, "载荷起点常量 = 15（报告偏移 16 减 1）");
  let bit = true;
  for (let i = 0; i < 1024; i++) if (d[15 + i] !== ref[i]) { bit = false; break; }
  ok(bit, "1024 字节载荷逐字节落在 data[15..1038]");
  ok(d.subarray(15).length === 1025, "★ data.subarray(15) 其实是 1025 字节（当初越界一位之处）");
}

console.log("[2] 自己构造的报文必须能过自己的校验 —— 这条断言就是当初该拦下 bug 的");
{
  ok(xm1GuardWrite(RPT_BULK, buildXm1BlobReport(ref), ref) === true,
     "构造 → 校验 往返通过（修复前恒为 false）");
  ok(xm1GuardEchoByte(RPT_CMD, buildXm1ByteReport(ref[0]), ref) === true,
     "buildXm1ByteReport(...) 通过 xm1GuardEchoByte");
}

console.log("[3] 回声校验必须拦截的一切变形");
{
  const base = buildXm1BlobReport(ref);
  const mut = (f: (d: Uint8Array) => void) => {
    const c = base.slice(); f(c); return xm1GuardWrite(RPT_BULK, c, ref);
  };
  ok(mut(c => { c[15 + 500] ^= 0x01; }) === false, "改动载荷中任意一字节 → 拦截");
  ok(mut(c => { c[4] ^= 0xFF; }) === false, "改动 buf[5] → 拦截");
  ok(mut(c => { c[1] = 1; }) === false, "buf[2] 非 0 → 拦截");
  ok(mut(c => { c[1039] = 1; }) === false, "尾巴非 0 → 拦截");
  ok(mut(c => { c[0] = 0x07; }) === false, "命令码不是 0x08 → 拦截");
  ok(xm1GuardWrite(RPT_BULK, base.slice(0, 1039), ref) === false, "长度 1039 → 拦截");
  const longer = new Uint8Array(1041); longer.set(base);          // slice 会被截断，必须真的造 1041
  ok(xm1GuardWrite(RPT_BULK, longer, ref) === false, "长度 1041 → 拦截");
  ok(xm1GuardWrite(RPT_CMD, base, ref) === false, "reportId 换成 0xA1 → 拦截");
  ok(xm1GuardWrite(RPT_BULK, base, null) === false, "没有基准 → 拦截");
  const other = new Uint8Array(1024); other.fill(0xAA);
  ok(xm1GuardWrite(RPT_BULK, buildXm1BlobReport(other), ref) === false,
     "换成另一份完全不同的配置 → 拦截（非回声一律拒绝）");
}

console.log("[4] 常驻查询的放行范围（无负载）");
{
  const q = (cmd: number) => { const b = new Uint8Array(63); b[0] = cmd; return b; };
  ok(xm1GuardQuery(RPT_CMD, q(0x03)) === true, "cmd 0x03（读字节）放行");
  ok(xm1GuardQuery(RPT_CMD, q(0x07)) === true, "cmd 0x07（读 blob）放行");
  const dirty = q(0x03); dirty[30] = 1;
  ok(xm1GuardQuery(RPT_CMD, dirty) === false, "cmd 0x03 带负载 → 拦截");
  ok(xm1GuardQuery(RPT_CMD, buildXm1ByteReport(0)) === false,
     "cmd 0x04（写字节）不在常驻白名单 —— 只在 arm 时按回声放行");
  ok(xm1GuardQuery(RPT_CMD, buildXm1BlobReport(ref)) === false, "1040B 当成查询 → 拦截");
  ok(xm1GuardQuery(RPT_BULK, q(0x03)) === false, "reportId 0xA0 的 63B → 拦截");
}

console.log("[5] 写单字节报文的形状");
{
  const b = buildXm1ByteReport(0x11);
  ok(b.length === 63, "长度 63");
  ok(b[0] === 0x04 && b[1] === 0 && b[2] === 0, "命令码 0x04");
  ok(b[3] === 0, "buf[4] = 0");
  ok(b[4] === 0x11, "buf[5] = 值");
  ok(b[5] === 0 && b[6] === 0, "buf[6..7] = 0");
}

console.log("[6] 受限编辑：只有已核实字段允许不同（这是写入安全的边界）");
{
  const patched = (f: (p: Uint8Array) => void) => {
    const p = ref.slice(); f(p); return buildXm1BlobReport(p);
  };
  const editable = new Set<number>(XM1_EDITABLE_OFFSETS);
  ok(editable.size === 23, "可编辑偏移共 23 个", String(editable.size));
  for (const o of [0x032, 0x033, 0x034, 0x035, 0x036, 0x037, 0x03C, 0x03D, 0x03E, 0x03F,
                   0x040, 0x046, 0x051, 0x052, 0x053, 0x054, 0x055, 0x057,
                   0x05B, 0x05C, 0x05D, 0x05E, 0x05F]) {
    if (!editable.has(o)) { ok(false, "偏移 0x" + o.toString(16) + " 应在可编辑集合内"); }
  }
  ok(true, "23 个字段偏移全部登记");
  ok(XM1_EDITABLE_SET_has0 === false, "blob[0] 不在可编辑集合内（含义未确认）");

  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x034] = 0x84; p[0x035] = 0x03; }), ref) === true,
     "改 CPI 1 的 X（0x034-0x035）→ 放行");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x057] = 0; }), ref) === true, "改 Ripple → 放行");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x046] = 0x0B; }), ref) === true, "改 LOD → 放行");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x032] = 2; }), ref) === true, "改激活档 → 放行");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x03C] = 0xFF; }), ref) === true, "改档 2 启用位 → 放行");

  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0] = 0x99; }), ref) === false, "改 blob[0] → 拦截");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x012] = 0x77; }), ref) === false, "改未核实偏移 0x012 → 拦截");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x06B] = 0x77; }), ref) === false, "改未解的表 A（0x06B）→ 拦截");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x0C7] = 0x77; }), ref) === false, "改未解的按键表（0x0C7）→ 拦截");
  ok(xm1GuardWrite(RPT_BULK, patched(p => { p[0x3FF] = 0x77; }), ref) === false, "改尾部任意字节 → 拦截");
  const two = patched(p => { p[0x034] = 0x84; p[0x100] = 1; });
  ok(xm1GuardWrite(RPT_BULK, two, ref) === false, "一个合法改动 + 一个非法改动 → 整体拦截");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
