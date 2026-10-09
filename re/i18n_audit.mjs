// i18n 词条审计：校验所有语言的键名集合、占位符数量是否与基准（en）一致。
// 用法：node re/i18n_audit.mjs
import { readFileSync, readdirSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), "utf8");

// 从一段源码里抽出 "key: \"value\"" 对（支持转义）
function pairs(src) {
  const out = new Map();
  for (const m of src.matchAll(/(\w+):\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2]);
  }
  return out;
}

// i18n.ts 内联的 zh-CN / en 两个块
const main = read("i18n.ts");
const blocks = {
  "zh-CN": pairs(main.split('  "zh-CN": {')[1].split("\n  }")[0]),
  en: pairs(main.split('  "en": {')[1].split("\n  }")[0]),
};

// src/i18n/*.ts 独立文件
const dir = new URL("./i18n/", SRC);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  blocks[f.replace(/\.ts$/, "")] = pairs(readFileSync(new URL(f, dir), "utf8"));
}

const base = blocks.en;
const baseKeys = [...base.keys()];
console.log("基准 en 键数:", baseKeys.length, "\n");

// 占位符 {0} {1} 的集合
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join(",");

let fails = 0;
for (const [lang, map] of Object.entries(blocks)) {
  if (lang === "en") continue;
  const keys = [...map.keys()];
  const missing = baseKeys.filter((k) => !map.has(k));
  const extra = keys.filter((k) => !base.has(k));
  const phBad = baseKeys.filter((k) => map.has(k) && ph(map.get(k)) !== ph(base.get(k)));
  const empty = keys.filter((k) => !map.get(k).trim());

  const ok = missing.length === 0 && extra.length === 0 && phBad.length === 0 && empty.length === 0;
  if (!ok) fails++;
  console.log(`${lang.padEnd(6)} 键数 ${String(map.size).padStart(3)}  ${ok ? "OK" : "FAIL"}`);
  if (missing.length) console.log("        缺键:", missing.join(" "));
  if (extra.length) console.log("        多键:", extra.join(" "));
  if (phBad.length) console.log("        占位符不一致:", phBad.map((k) => `${k}(${ph(map.get(k)) || "-"} vs ${ph(base.get(k)) || "-"})`).join(" "));
  if (empty.length) console.log("        空值:", empty.join(" "));
}

// 按 LANG 直接取用的表（src/main.ts）必须覆盖全部语言，否则运行时 undefined。
// 这是最容易漏的一处：字典加了语言、忘记加这两张表 → 一打开该语言就崩。
console.log("\n按 LANG 直接取用的表（src/render.ts）：");
const renderSrc = read("render.ts");
const langs = Object.keys(blocks);
for (const name of ["STAGE_COLORS", "BTN_NAMES"]) {
  // 类型标注可能是 `const X = {` 或 `const X: Record<string, string[]> = {` —— 两种都要认
  const seg = renderSrc.split(new RegExp(`const ${name}(?::[^=]+)? = {`))[1];
  if (!seg) { console.log(`  ${name.padEnd(13)} 未找到  FAIL`); fails++; continue; }
  const got = new Set([...seg.split("\n};")[0].matchAll(/"([a-zA-Z-]+)":/g)].map((m) => m[1]));
  const missing = langs.filter((l) => !got.has(l));
  const extra = [...got].filter((l) => !langs.includes(l));
  const ok = missing.length === 0 && extra.length === 0;
  if (!ok) fails++;
  console.log(`  ${name.padEnd(13)} ${String(got.size).padStart(2)} 种  ${ok ? "OK" : "FAIL"}`);
  if (missing.length) console.log("        缺:", missing.join(" "));
  if (extra.length) console.log("        多:", extra.join(" "));
}

// 代码里引用的 t("key") 必须都在字典里 —— 否则界面直接显示裸 key 名（很难看，且没人会注意到）。
// 这条是补的：我自己就犯过「render 里引用了 helpXy、字典里没加」。
console.log("\n代码引用的词条是否存在：");
const srcFiles = readdirSync(SRC).filter((f) => f.endsWith(".ts"));
const missingRefs = new Set();
for (const f of srcFiles) {
  const code = readFileSync(new URL(f, SRC), "utf8");
  const body = f === "i18n.ts" ? code.slice(0, code.indexOf("const I18N")) : code;
  for (const m of body.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) {
    if (!base.has(m[1])) missingRefs.add(`${m[1]}  (${f})`);
  }
}
if (missingRefs.size) {
  fails++;
  console.log("  缺词条:", [...missingRefs].join("  "));
} else {
  console.log("  全部命中  OK");
}

console.log(`\n结果：${langs.length} 种语言，${fails} 项失败`);
process.exit(fails ? 1 : 0);
