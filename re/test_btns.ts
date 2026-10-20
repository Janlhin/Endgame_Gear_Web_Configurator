// 按键卡结构：一张表、8 行 3 列、点击过滤直接编辑 blob 真值。
//
// 背景（2026-10-20）：#cardBtns 此前是**并排的两张独立 table**——
//   左表 #btnRows    8 行（读 blob 真值 buttons[i].filter）
//   右表 #filterRows 5 行（写一个从不被赋值的假数组 filters[]）
// 行数不同 → 右侧留一大片空白；右表每行塞 <select> 行高更大 →
// 连本该对应的前 5 行也永远对不齐。而右表显示的是默认的 [8,8,8,8,8]，
// 设备真实的 GX Safe / GX Speed 根本看不到 —— 点一次「应用性能/电源」
// 还会把设备上的真值静默覆盖成 8ms。
//
// 修法：合并成一张表 8 行 3 列，删除 filters[] 这份假状态，
// 点击过滤列直接编辑 buttons[i].filter（唯一事实源）。
import "./_domstub.js";
import { el } from "./_domstub.js";
import { render } from "../src/render.js";
import { S } from "../src/state.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

/* 造一份 blob 解析后的 stage.buttons（模拟真机读回：
   左键 = GX Speed(0xF1)、右键 = GX Safe(0xF0)、其余毫秒值）。 */
const BTNS = [
  { type: 1, code: 1, key: 1, filter: 0xF1 },
  { type: 1, code: 2, key: 2, filter: 0xF0 },
  { type: 1, code: 3, key: 3, filter: 8 },
  { type: 1, code: 4, key: 4, filter: 8 },
  { type: 1, code: 5, key: 5, filter: 8 },
  { type: 1, code: 6, key: 6, filter: 8 },
  { type: 1, code: 7, key: 7, filter: 8 },
  { type: 1, code: 8, key: 8, filter: 8 },
];

const saved = S.stage;
S.stage = { ...saved, buttons: BTNS.map((b) => ({ ...b })) } as any;
render();
const tb = el("btnRows");

console.log("[1] 一张表 8 行 3 列");
{
  const rows = tb.children as any[];
  ok(rows.length === 8, "8 行（按钮块 8 项）", String(rows.length));
  const colCounts = rows.map((r) => r.children.length);
  ok(colCounts.every((c) => c === 3), "每行 3 列（按键|映射|点击过滤）", colCounts.join(","));
}

console.log("\n[2] 点击过滤列：前 5 行可编辑，后 3 行置灰");
{
  const rows = tb.children as any[];
  const sels = rows.map((r) => r.children[2].children[0]).filter((c) => c && c.dataset && c.dataset.f !== undefined);
  ok(sels.length === 5, "前 5 行有下拉（协议只有 5 个过滤槽）", String(sels.length));
  const nas = rows.map((r) => r.children[2].children[0]).filter((c) => c && c.className === "na");
  ok(nas.length === 3, "后 3 行是「不支持」占位", String(nas.length));
}

console.log("\n[3] 下拉显示的是 blob 真值（此前是假默认值 8）");
{
  const rows = tb.children as any[];
  const s0 = rows[0].children[2].children[0];
  const s1 = rows[1].children[2].children[0];
  ok(s0.value === "241", "左键下拉 = 0xF1 = GX Speed（不是默认 8）", s0.value);
  ok(s1.value === "240", "右键下拉 = 0xF0 = GX Safe", s1.value);
  ok(s0.dataset.f === "0" && s1.dataset.f === "1", "下拉带 data-f 索引");
}

console.log("\n[3b] 特例值必须能被选中（value 用数字，文本会选不中）");
{
  /* 此前 0xF0/0xF1 的 option value 是字符串 "0xF0"/"0xF1"，
     而 blob 里是数字 0xF0/0xF1 → String() 匹配不上 → 下拉**一个都不选中**
     （显示空白），而且 onchange 里 +"0xF1" 会得到 NaN。 */
  const rows = tb.children as any[];
  const s0 = rows[0].children[2].children[0];
  const optVals = (s0.options || []).map((o: any) => o.value);
  ok(optVals.includes("241"), "GX Speed 的 option value 是数字 241", optVals.join(","));
  ok(optVals.includes("240"), "GX Safe 的 option value 是数字 240");
  /* onchange 回写：选 241 必须写回 241（不是 NaN）。 */
  s0.value = "241";
  s0.onchange({ target: s0 } as any);
  ok(S.stage.buttons[0].filter === 241, "选 GX Speed → 写回 241", String(S.stage.buttons[0].filter));
}

console.log("\n[3c] 设备上的值不在选项表内时，不能一个都不选中");
{
  const saved2 = S.stage;
  S.stage = { ...saved2, buttons: [{ type: 1, code: 1, key: 1, filter: 25 }] } as any;
  render();
  const s = el("btnRows").children[0].children[2].children[0];
  ok(s.value === "25", "值 25（超出选项表）也会被选中并显示", s.value);
  S.stage = saved2;
}

console.log("\n[4] 改下拉写回的是 buttons[i].filter（唯一事实源）");
{
  /* 用一份独立数据：[3b] 已经把 buttons[0].filter 改成 241 了。 */
  const saved2 = S.stage;
  S.stage = { ...saved2, buttons: [{ type: 1, code: 1, key: 1, filter: 0xF1 }, { type: 1, code: 2, key: 2, filter: 0xF0 }] } as any;
  render();
  const rows = el("btnRows").children as any[];
  const s0 = rows[0].children[2].children[0];
  s0.value = "8";
  s0.onchange({ target: s0 } as any);
  ok(S.stage.buttons[0].filter === 8, "改左键下拉 → buttons[0].filter = 8", String(S.stage.buttons[0].filter));
  ok(S.stage.buttons[1].filter === 0xF0, "其余行不受影响（右键仍是 GX Safe）", String(S.stage.buttons[1].filter));
  S.stage = saved2;
}

S.stage = saved;

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);
