// src/protocol.ts
var RPT_CMD = 161;
var RPT_BULK = 160;
var XM1_BLOB_DATA_LEN = 1040;
var XM1_PAYLOAD_OFF_IN_DATA = 15;
function buildXm1BlobReport(payload) {
  if (payload.length !== 1024) throw new Error("XM1 \u8F7D\u8377\u5FC5\u987B\u662F 1024 \u5B57\u8282");
  const data = new Uint8Array(XM1_BLOB_DATA_LEN);
  data[0] = 8;
  data[4] = payload[0];
  data.set(payload, XM1_PAYLOAD_OFF_IN_DATA);
  return data;
}
function buildXm1ByteReport(value) {
  const b = new Uint8Array(63);
  b[0] = 4;
  b[3] = 0;
  b[4] = value & 255;
  return b;
}
function xm1GuardQuery(reportId, data) {
  return reportId === RPT_CMD && data instanceof Uint8Array && data.length === 63 && (data[0] === 3 || data[0] === 7) && data.every((b, i) => i < 1 ? true : b === 0);
}
function xm1GuardEchoBlob(reportId, data, ref2) {
  if (reportId !== RPT_BULK || !(data instanceof Uint8Array) || !ref2) return false;
  if (data.length !== XM1_BLOB_DATA_LEN || ref2.length !== 1024) return false;
  if (data[0] !== 8) return false;
  if (data[1] !== 0 || data[2] !== 0 || data[3] !== 0) return false;
  if (data[5] !== 0 || data[6] !== 0) return false;
  if (data[4] !== ref2[0]) return false;
  if (data[1039] !== 0) return false;
  for (let i = 0; i < 1024; i++) {
    if (data[XM1_PAYLOAD_OFF_IN_DATA + i] !== ref2[i]) return false;
  }
  return true;
}
function xm1GuardEchoByte(reportId, data, ref2) {
  if (reportId !== RPT_CMD || !(data instanceof Uint8Array) || !ref2) return false;
  if (data.length !== 63 || data[0] !== 4) return false;
  if (data[3] !== 0 || data[4] !== ref2[0]) return false;
  return data.every((b, i) => i === 0 || i === 4 ? true : b === 0);
}

// re/test_xm1_write.ts
var pass = 0;
var fail = 0;
var ok = (cond, name, extra = "") => {
  if (cond) {
    pass++;
    console.log("  \u2713 " + name);
  } else {
    fail++;
    console.log("  \u2717 " + name + (extra ? "  \u2192 " + extra : ""));
  }
};
var ref = new Uint8Array(1024);
ref[0] = 17;
ref[52] = 144;
ref[53] = 1;
ref[87] = 1;
console.log("[1] \u5199 blob \u62A5\u6587\u7684\u51E0\u4F55\u5173\u7CFB\uFF08\u5BF9\u5E94\u5B98\u65B9 0x40FB90\uFF09");
{
  const d = buildXm1BlobReport(ref);
  ok(XM1_BLOB_DATA_LEN === 1040, "data \u957F\u5EA6\u5E38\u91CF = 1040\uFF08\u62A5\u544A 1041 \u51CF reportId\uFF09");
  ok(d.length === 1040, "\u6784\u9020\u7ED3\u679C\u957F\u5EA6 1040");
  ok(d[0] === 8, "\u547D\u4EE4\u7801 = 0x08");
  ok(d[1] === 0 && d[2] === 0 && d[3] === 0, "buf[2..4] = 0");
  ok(d[4] === ref[0], "buf[5] = blob[0]\uFF08\u5B98\u65B9\u4F20\u7684\u5C31\u662F obj[4]\uFF09");
  ok(d[5] === 0 && d[6] === 0, "buf[6..7] = 0");
  ok(d[1039] === 0, "data[1039] = 0\uFF08\u5BF9\u5E94\u62A5\u544A [1040]\uFF0Cmemset \u7684\u5C3E\u5DF4\uFF09");
  ok(XM1_PAYLOAD_OFF_IN_DATA === 15, "\u8F7D\u8377\u8D77\u70B9\u5E38\u91CF = 15\uFF08\u62A5\u544A\u504F\u79FB 16 \u51CF 1\uFF09");
  let bit = true;
  for (let i = 0; i < 1024; i++) if (d[15 + i] !== ref[i]) {
    bit = false;
    break;
  }
  ok(bit, "1024 \u5B57\u8282\u8F7D\u8377\u9010\u5B57\u8282\u843D\u5728 data[15..1038]");
  ok(d.subarray(15).length === 1025, "\u2605 data.subarray(15) \u5176\u5B9E\u662F 1025 \u5B57\u8282\uFF08\u5F53\u521D\u8D8A\u754C\u4E00\u4F4D\u4E4B\u5904\uFF09");
}
console.log("[2] \u81EA\u5DF1\u6784\u9020\u7684\u62A5\u6587\u5FC5\u987B\u80FD\u8FC7\u81EA\u5DF1\u7684\u6821\u9A8C \u2014\u2014 \u8FD9\u6761\u65AD\u8A00\u5C31\u662F\u5F53\u521D\u8BE5\u62E6\u4E0B bug \u7684");
{
  ok(
    xm1GuardEchoBlob(RPT_BULK, buildXm1BlobReport(ref), ref) === true,
    "buildXm1BlobReport(...) \u901A\u8FC7 xm1GuardEchoBlob\uFF08\u4FEE\u590D\u524D\u6052\u4E3A false\uFF09"
  );
  ok(
    xm1GuardEchoByte(RPT_CMD, buildXm1ByteReport(ref[0]), ref) === true,
    "buildXm1ByteReport(...) \u901A\u8FC7 xm1GuardEchoByte"
  );
}
console.log("[3] \u56DE\u58F0\u6821\u9A8C\u5FC5\u987B\u62E6\u622A\u7684\u4E00\u5207\u53D8\u5F62");
{
  const base = buildXm1BlobReport(ref);
  const mut = (f) => {
    const c = base.slice();
    f(c);
    return xm1GuardEchoBlob(RPT_BULK, c, ref);
  };
  ok(mut((c) => {
    c[15 + 500] ^= 1;
  }) === false, "\u6539\u52A8\u8F7D\u8377\u4E2D\u4EFB\u610F\u4E00\u5B57\u8282 \u2192 \u62E6\u622A");
  ok(mut((c) => {
    c[4] ^= 255;
  }) === false, "\u6539\u52A8 buf[5] \u2192 \u62E6\u622A");
  ok(mut((c) => {
    c[1] = 1;
  }) === false, "buf[2] \u975E 0 \u2192 \u62E6\u622A");
  ok(mut((c) => {
    c[1039] = 1;
  }) === false, "\u5C3E\u5DF4\u975E 0 \u2192 \u62E6\u622A");
  ok(mut((c) => {
    c[0] = 7;
  }) === false, "\u547D\u4EE4\u7801\u4E0D\u662F 0x08 \u2192 \u62E6\u622A");
  ok(xm1GuardEchoBlob(RPT_BULK, base.slice(0, 1039), ref) === false, "\u957F\u5EA6 1039 \u2192 \u62E6\u622A");
  const longer = new Uint8Array(1041);
  longer.set(base);
  ok(xm1GuardEchoBlob(RPT_BULK, longer, ref) === false, "\u957F\u5EA6 1041 \u2192 \u62E6\u622A");
  ok(xm1GuardEchoBlob(RPT_CMD, base, ref) === false, "reportId \u6362\u6210 0xA1 \u2192 \u62E6\u622A");
  ok(xm1GuardEchoBlob(RPT_BULK, base, null) === false, "\u6CA1\u6709\u57FA\u51C6 \u2192 \u62E6\u622A");
  const other = new Uint8Array(1024);
  other.fill(170);
  ok(
    xm1GuardEchoBlob(RPT_BULK, buildXm1BlobReport(other), ref) === false,
    "\u6362\u6210\u53E6\u4E00\u4EFD\u5B8C\u5168\u4E0D\u540C\u7684\u914D\u7F6E \u2192 \u62E6\u622A\uFF08\u975E\u56DE\u58F0\u4E00\u5F8B\u62D2\u7EDD\uFF09"
  );
}
console.log("[4] \u5E38\u9A7B\u67E5\u8BE2\u7684\u653E\u884C\u8303\u56F4\uFF08\u65E0\u8D1F\u8F7D\uFF09");
{
  const q = (cmd) => {
    const b = new Uint8Array(63);
    b[0] = cmd;
    return b;
  };
  ok(xm1GuardQuery(RPT_CMD, q(3)) === true, "cmd 0x03\uFF08\u8BFB\u5B57\u8282\uFF09\u653E\u884C");
  ok(xm1GuardQuery(RPT_CMD, q(7)) === true, "cmd 0x07\uFF08\u8BFB blob\uFF09\u653E\u884C");
  const dirty = q(3);
  dirty[30] = 1;
  ok(xm1GuardQuery(RPT_CMD, dirty) === false, "cmd 0x03 \u5E26\u8D1F\u8F7D \u2192 \u62E6\u622A");
  ok(
    xm1GuardQuery(RPT_CMD, buildXm1ByteReport(0)) === false,
    "cmd 0x04\uFF08\u5199\u5B57\u8282\uFF09\u4E0D\u5728\u5E38\u9A7B\u767D\u540D\u5355 \u2014\u2014 \u53EA\u5728 arm \u65F6\u6309\u56DE\u58F0\u653E\u884C"
  );
  ok(xm1GuardQuery(RPT_CMD, buildXm1BlobReport(ref)) === false, "1040B \u5F53\u6210\u67E5\u8BE2 \u2192 \u62E6\u622A");
  ok(xm1GuardQuery(RPT_BULK, q(3)) === false, "reportId 0xA0 \u7684 63B \u2192 \u62E6\u622A");
}
console.log("[5] \u5199\u5355\u5B57\u8282\u62A5\u6587\u7684\u5F62\u72B6");
{
  const b = buildXm1ByteReport(17);
  ok(b.length === 63, "\u957F\u5EA6 63");
  ok(b[0] === 4 && b[1] === 0 && b[2] === 0, "\u547D\u4EE4\u7801 0x04");
  ok(b[3] === 0, "buf[4] = 0");
  ok(b[4] === 17, "buf[5] = \u503C");
  ok(b[5] === 0 && b[6] === 0, "buf[6..7] = 0");
}
console.log(`
\u7ED3\u679C\uFF1A${pass} \u901A\u8FC7 / ${fail} \u5931\u8D25`);
if (fail) process.exit(1);
