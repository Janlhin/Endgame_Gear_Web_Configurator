// 传感器表两族同构：都是 5 列「档位 | 启用 | 当前 | CPI X | CPI Y」。
//
// 背景（2026-10-20）：此前两族各写一套表头与表体 ——
//   4k 族：档位 | LED 颜色 | XY 独立 | CPI X | CPI Y
//   XM1  ：档位 | 启用 | 当前 | CPI(单值，跨 2 列) + 第 5 列隐藏
// 同一个控件在两族下是两套列语义，无法互相对照；XM1 的说明还被塞进
// 表内的一行 <tr class="muted">，被列宽挤成密排小字。
//
// 修法：表头统一为 5 列（layout.ts 的 SENSOR_COLS），差异只体现在
// **单元格内容**上：4k 的「启用」是受约束勾选（levels 只能是前缀）、
// Y 可编辑；XM1 的「启用」是真值 checkbox、Y 不支持（固件只读 X）。
import "./_domstub.js";
import { el } from "./_domstub.js";
import { render, renderXm1 } from "../src/render.js";
import { S } from "../src/state.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

const saved = S.stage;

console.log("[1] 4k 族：5 列表格，列语义正确");
{
  S.stage = {
    ...saved, gen: 2, levels: 4, active: 0,
    cpi: [[0, 800, 800], [0, 1600, 1600], [0, 3200, 3200], [0, 6400, 6400]],
  } as any;
  render();
  const rows = el("cpiRows").children as any[];
  ok(rows.length === 4, "4 行（4 个 CPI 档）", String(rows.length));
  ok(rows.every((r) => r.children.length === 5), "每行 5 个 td",
     rows.map((r) => r.children.length).join(","));
  /* 启用列：勾选态 = n < levels */
  const onChecks = rows.map((r) => r.children[1].children[0]);
  ok(onChecks.every((c, i) => c.checked === (i < 4)), "启用列勾选态 = n < levels",
     onChecks.map((c) => c.checked).join(","));
  /* 当前列：radio，只有 active 那档选中 */
  const actRadios = rows.map((r) => r.children[2].children[0]);
  ok(actRadios[0].checked === true && actRadios[1].checked === false,
     "当前列 radio 只选中 active 档");
  /* 档位列有色点 */
  ok(rows[0].children[0].innerHTML.includes("stageDot"), "档位列有 LED 色点");
  /* Y 格：XY 勾选框 + 数字框 */
  ok(rows[0].children[4].children.length === 2, "CPI Y 格 = XY 勾选框 + 数字框",
     String(rows[0].children[4].children.length));
}

console.log("\n[2] 4k 的「启用」是受约束勾选：勾第 N 档 → levels = N+1");
{
  S.stage = { ...saved, gen: 2, levels: 2, active: 0,
    cpi: [[0, 800, 800], [0, 1600, 1600], [0, 3200, 3200], [0, 6400, 6400]] } as any;
  render();
  const rows = el("cpiRows").children as any[];
  /* 勾第 3 档（index 2）→ levels 应变成 3 */
  const cb = rows[2].children[1].children[0];
  cb.checked = true;
  cb.onchange();
  ok(S.stage.levels === 3, "勾第 3 档 → levels = 3", String(S.stage.levels));
  /* 取消第 2 档（index 1）→ levels 应变成 1 */
  render();
  const rows2 = el("cpiRows").children as any[];
  const cb2 = rows2[1].children[1].children[0];
  cb2.checked = false;
  cb2.onchange();
  ok(S.stage.levels === 1, "取消第 2 档 → levels = 1", String(S.stage.levels));
}

console.log("\n[3] XM1 族：同样 5 列，Y 格是「不支持」占位");
{
  S.xm1 = true;
  /* renderXm1 在没有 blob 时会走「请先读取」的空态分支（只渲染 1 行）。 */
  S.blob = new Uint8Array(1024);
  S.xm1Edit = {
    active: 0,
    stages: [
      { idx: 0, on: true, x: 400, y: 400 },
      { idx: 1, on: true, x: 800, y: 800 },
      { idx: 2, on: true, x: 1600, y: 1600 },
      { idx: 3, on: true, x: 3200, y: 3200 },
    ],
    lodMM: 2, ripple: 0,
  } as any;
  renderXm1();
  const rows = el("cpiRows").children as any[];
  ok(rows.length === 4, "4 行（XM1 固定 4 档）", String(rows.length));
  ok(rows.every((r) => r.children.length === 5), "每行 5 个 td（与 4k 同构）",
     rows.map((r) => r.children.length).join(","));
  /* Y 格是「不支持」占位，不是输入框 */
  const yCell = rows[0].children[4];
  ok(String(yCell.className).includes("na"), "CPI Y 格是「不支持」占位（无输入框）",
     "class=" + yCell.className + " children=" + yCell.children.length);
  ok(yCell.children.length === 0, "Y 格内没有输入框", String(yCell.children.length));
  /* 启用列是真值 checkbox（可自由勾选，不受前缀约束） */
  const onBox = rows[0].children[1].children[0];
  ok(onBox !== undefined && onBox.dataset.on === "0", "启用列是 data-on 复选框");
  /* 当前列 radio */
  ok(rows[0].children[2].children[0].dataset.act === "0", "当前列是 radio");
  S.xm1 = false;
}

S.stage = saved;

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);
