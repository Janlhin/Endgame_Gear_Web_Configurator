// 一次性工具：把 main.ts 里的共享状态引用重命名为 S.xxx。
// 关键点：必须跳过注释与字符串字面量 —— 日志文案里就写着 "✓ blob read OK"，
// 盲目替换会把给用户看的日志改成 "S.blob read OK"。
// 用法：node re/_rename.mjs <dry|write>
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/main.ts";
const VARS = ["xm1LastRead", "xm1Armed", "frameAligned", "unknownModel", "xm1Snaps", "lastFrame",
  "dongleFw", "mouseName", "unverified", "xm1Edit", "family4", "eightK", "lastFail", "battery",
  "mouseFw", "queue", "stage", "wired", "blob", "xm1", "gen", "dev"];   // 长名在前

const src = readFileSync(FILE, "utf8");
const inCode = new Uint8Array(src.length);

// ---- 词法扫描：标出「代码」区域 ----
{
  const stack = [{ t: "code" }];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i], n = src[i + 1];
    if (top.t === "code") {
      if (c === "/" && n === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === '"') { stack.push({ t: "dq" }); i++; continue; }
      if (c === "'") { stack.push({ t: "sq" }); i++; continue; }
      if (c === "`") { stack.push({ t: "tpl" }); i++; continue; }
      if (c === "{" && top.fromTpl) top.brace = (top.brace || 0) + 1;
      if (c === "}" && top.fromTpl) {
        if (!top.brace) { stack.pop(); i++; continue; }
        top.brace--;
      }
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

// ---- 收集替换点 ----
const edits = [];
const skipped = [];
for (let i = 0; i < src.length; i++) {
  for (const v of VARS) {
    if (!src.startsWith(v, i)) continue;
    const before = i === 0 ? "" : src[i - 1];
    const after = src[i + v.length] || "";
    if (/[\w.$]/.test(before)) continue;      // 前面是标识符字符或点 → 不是我们要改的引用
    if (/[\w$:]/.test(after)) continue;       // 后面接标识符或冒号（对象键）→ 跳过
    if (!inCode[i]) { skipped.push({ v, i }); break; }
    edits.push({ s: i, e: i + v.length, v });
    i += v.length - 1;
    break;
  }
}

const count = {};
for (const e of edits) count[e.v] = (count[e.v] || 0) + 1;
console.log("将替换:", edits.length, "处");
console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" "));
console.log("\n被跳过（位于注释/字符串内）:", skipped.length, "处 ←");
const sk = {};
for (const s of skipped) sk[s.v] = (sk[s.v] || 0) + 1;
console.log(Object.entries(sk).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" "));

// 抽样：显示前 6 处跳过的上下文
console.log("\n跳过的样例（确认它们确实在注释/字符串里）：");
for (const s of skipped.slice(0, 6)) {
  console.log("   ", JSON.stringify(src.slice(Math.max(0, s.i - 30), s.i + 20)));
}

// 按行统计改动，看有没有落到可疑位置
const lines = new Set(edits.map((e) => src.slice(0, e.s).split("\n").length));
console.log("\n涉及行数:", lines.size);

if (process.argv[2] === "write") {
  let out = "";
  let last = 0;
  for (const e of edits) { out += src.slice(last, e.s) + "S." + e.v; last = e.e; }
  out += src.slice(last);
  writeFileSync(FILE, out);
  console.log("\n已写入 " + FILE);
}
