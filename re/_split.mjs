// 一次性：把 main.ts 里成组的函数整块搬到目标文件（含各自的文档注释）。
// 只做搬运，不加 export/import —— 那些在脚本里显式给出，避免自动推断出错。
import { readFileSync, writeFileSync } from "node:fs";

const MAIN = "src/main.ts";
let src = readFileSync(MAIN, "utf8");

// —— 词法扫描，标出代码区 ——
const inCode = new Uint8Array(src.length);
{
  const stack = [{ t: "code" }];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1], c = src[i], n = src[i + 1];
    if (top.t === "code") {
      if (c === "/" && n === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === '"') { stack.push({ t: "dq" }); i++; continue; }
      if (c === "'") { stack.push({ t: "sq" }); i++; continue; }
      if (c === "`") { stack.push({ t: "tpl" }); i++; continue; }
      if (c === "{" && top.fromTpl) top.brace = (top.brace || 0) + 1;
      if (c === "}" && top.fromTpl) { if (!top.brace) { stack.pop(); i++; continue; } top.brace--; }
      inCode[i] = 1; i++; continue;
    }
    if (top.t === "tpl") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); i++; continue; }
      if (c === "$" && n === "{") { stack.push({ t: "code", fromTpl: true, brace: 0 }); i += 2; continue; }
      i++; continue;
    }
    if (top.t === "dq") { if (c === "\\") { i += 2; continue; } if (c === '"') stack.pop(); i++; continue; }
    if (top.t === "sq") { if (c === "\\") { i += 2; continue; } if (c === "'") stack.pop(); i++; continue; }
  }
}

/** 函数声明行前紧邻的注释块也一并带走（中间有空行就停 —— 那种注释不属于它）。 */
function commentStartAbove(at) {
  let i = at;
  for (;;) {
    const lineEnd = src.lastIndexOf("\n", i - 1);
    if (lineEnd < 0) return 0;
    const lineStart = src.lastIndexOf("\n", lineEnd - 1) + 1;
    const line = src.slice(lineStart, lineEnd);
    if (/^\s*$/.test(line)) return i;
    if (/^\s*\/\//.test(line)) { i = lineStart; continue; }
    if (/^\s*\*\//.test(line)) {
      const open = src.lastIndexOf("/*", lineStart);
      return src.lastIndexOf("\n", open - 1) + 1;
    }
    return i;
  }
}

function findFn(name) {
  const re = new RegExp("^(?:async )?function " + name + "\\b[^\\n]*\\{", "m");
  const m = re.exec(src);
  if (!m) throw new Error("找不到函数: " + name);
  const braceAt = m.index + m[0].length - 1;
  let depth = 0, i = braceAt, end = -1;
  while (i < src.length) {
    if (inCode[i]) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (!depth) { end = i + 1; break; } }
    }
    i++;
  }
  if (end < 0) throw new Error("括号不匹配: " + name);
  return { start: commentStartAbove(m.index), end, declAt: m.index };
}

const GROUPS = [
  {
    file: "src/device-xm1.ts",
    head: `/** XM1 / XM1 RGB（VID 0x22D4，2020 有线变体）的配置读写。
 *
 *  ★ 这个模块承载本项目最重的一段安全约束：写入只允许「回声」——
 *    下发的 1024B 必须逐字节来自刚读回的数据，且只放开 23 个差分实测确认的字节
 *    （protocol.ts 的 xm1GuardWrite 强制）。2026-10-09 曾因下发 1041B 全零 blob
 *    把用户鼠标的 DPI/CPI 清零，完整证据链见 re/XM1_NOTES.md。
 *
 *  ★ 这里直接调 readBlobXm1 而非 readBlob：后者是「按族分发」的调度，
 *    对 XM1 而言本来就是转调本函数 —— 直接调用可让本模块不依赖 device-4k。
 */
import { sleep, hex, log, banner } from "./util.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { RPT_CMD, RPT_BULK, XM1_SETTLE_MS, buildXm1BlobReport, buildXm1ByteReport, xm1GuardEchoByte } from "./protocol.js";
import { looksLikeBlob, xm1Parse, XM1_F, XM1_STAGE_ON, xm1LodToMm } from "./blob.js";

`,
    fns: ["xm1QueryReq", "xm1QueryByte", "readBlobXm1", "writeBlobXm1", "xm1Snapshot", "xm1PatchEdit", "xm1FieldName", "xm1Apply"],
  },
  {
    file: "src/device-8k.ts",
    head: `/** 8k 有线族（XM2 8k / OP1 8k 及 v2 / PF / Raw）的读取与整块写。
 *
 *  与 4k 无线族的差异**只有写命令**：读仍是 0x12 + 1024B blob，blob 偏移逐字节相同。
 *  4k 用 0x14/0x15/0x16 分块写，8k 用 **0x11 整块写**。
 *  ⚠️ 尚无线材真机验证，故写入严格读-改-写：未确认字段一律保持设备刚给的值。
 */
import { sleep, hex, log } from "./util.js";
import { t } from "./i18n.js";
import { S } from "./state.js";
import { RPT_CMD, RPT_BULK, buildBlob8k, build8kStoreData } from "./protocol.js";
import { looksLikeBlob8k } from "./blob.js";

`,
    fns: ["readBlob8k", "pollAck8k", "store8k", "verifySensor8k", "verifyPerf8k"],
  },
  {
    file: "src/device-4k.ts",
    head: `/** 4k 无线族（XM2w 4k / OP1w 4k 及 v2）的配置读取。
 *
 *  命令 0x12 请求 1024B blob；两种响应格式见下面的注释。
 *  XM1 分支转调 device-xm1（单向依赖，不构成环）。
 */
import { sleep, hex, log } from "./util.js";
import { S } from "./state.js";
import { RPT_CMD, RPT_BULK } from "./protocol.js";
import { looksLikeBlob } from "./blob.js";
import { readBlobXm1 } from "./device-xm1.js";

`,
    fns: ["readBlob"],
  },
];

const cuts = [];
for (const g of GROUPS) {
  let body = g.head;
  for (const name of g.fns) {
    const f = findFn(name);
    let text = src.slice(f.start, f.end);
    // 给顶层声明加 export
    text = text.replace(/^((?:\/\*[\s\S]*?\*\/\s*)*)(async function|function)/m, "$1export $2");
    body += text + "\n\n";
    cuts.push({ name, start: f.start, end: f.end, file: g.file });
  }
  writeFileSync(g.file, body.replace(/\n{3,}/g, "\n\n"));
  console.log(`✓ ${g.file}: ${g.fns.length} 个函数`);
}

// 从 main.ts 摘除（从后往前，避免位置失效）
cuts.sort((a, b) => b.start - a.start);
for (const c of cuts) src = src.slice(0, c.start) + src.slice(c.end);
src = src.replace(/\n{3,}/g, "\n\n");
writeFileSync(MAIN, src);
console.log(`✓ main.ts 摘除 ${cuts.length} 个函数`);
