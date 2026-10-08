// 一次性：按文本标记把一段代码从 main.ts 搬到目标文件（函数用 _split.mjs，常量表用这个）。
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const MAIN = "src/main.ts";
let src = readFileSync(MAIN, "utf8");

// { file, from, to, toExport }
const MOVES = [
  {
    file: "src/device-xm1.ts",
    from: "const XM1_READ_REQ = xm1QueryReq(0x07);",
    to: "const XM1_READ_REQ = xm1QueryReq(0x07);",
    toExport: true,
  },
];

for (const mv of MOVES) {
  const a = src.indexOf(mv.from);
  if (a < 0) throw new Error("找不到起点: " + mv.from);
  const b = src.indexOf(mv.to, a);
  if (b < 0) throw new Error("找不到终点: " + mv.to);
  const end = b + mv.to.length;
  let text = src.slice(a, end);
  if (mv.toExport) text = text.replace(/^const /gm, "export const ");
  appendFileSync(mv.file, "\n" + text + "\n");
  src = src.slice(0, a) + src.slice(end);
  console.log(`✓ 搬运 ${end - a} 字符 → ${mv.file}`);
}

src = src.replace(/\n{3,}/g, "\n\n");
writeFileSync(MAIN, src);
console.log("✓ main.ts 已更新");
