// 一次性：提取 main.ts 的顶层函数并算出互相调用的依赖图，用来确定拆分顺序与环。
import { readFileSync } from "node:fs";
const src = readFileSync("src/main.ts", "utf8");

// —— 词法扫描：标出代码区（复用 _rename.mjs 的做法）——
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

// —— 找出每个顶层函数声明的起止 ——
const re = /^(?:async )?function ([A-Za-z0-9_]+)[^\n]*\{/gm;
const fns = [];
let m;
while ((m = re.exec(src)) !== null) {
  const start = m.index;
  const braceAt = m.index + m[0].length - 1;
  let depth = 0, i = braceAt, end = -1;
  while (i < src.length) {
    if (inCode[i]) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (!depth) { end = i + 1; break; } }
    }
    i++;
  }
  fns.push({ name: m[1], start, end });
}
console.log("顶层函数:", fns.length, "\n");

// —— 依赖：函数体内出现其它函数名后跟 ( ——
const names = fns.map((f) => f.name);
const deps = new Map();
for (const f of fns) {
  const body = src.slice(f.start, f.end);
  const set = new Set();
  for (const n of names) {
    if (n === f.name) continue;
    const r = new RegExp("(?<![\\w$.])" + n + "\\s*\\(", "g");
    // 只看代码区
    let mm;
    while ((mm = r.exec(body)) !== null) {
      if (inCode[f.start + mm.index]) { set.add(n); break; }
    }
  }
  deps.set(f.name, [...set]);
}

// —— 输出：按行号排序 ——
for (const f of fns) {
  const d = deps.get(f.name);
  console.log(`${f.name}  ->  ${d.length ? d.join(", ") : "(无)"}`);
}

// —— 环检测（只报简单环）——
const seen = new Set();
const cycles = [];
function dfs(node, path) {
  if (path.includes(node)) { cycles.push([...path.slice(path.indexOf(node)), node].join(" → ")); return; }
  if (seen.has(node)) return;
  seen.add(node);
  for (const d of deps.get(node) || []) dfs(d, [...path, node]);
}
for (const f of fns) dfs(f.name, []);
console.log("\n发现的环:");
console.log(cycles.length ? [...new Set(cycles)].join("\n") : "  无");
