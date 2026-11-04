// 写入面"不越界"回归：把**当前已开放的每一个写入项**钉死，并钉死两条边界。
//
// 背景（2026-10-09）：用户问"我们的设置跟官方工具有多大区别、会不会过度改写带来隐患"。
// 对照结论见 docs/field-parity.md：设置项上我们是官方的**真子集**（21/28），
// 但有两处必须靠测试钉住，否则以后容易回潮：
//
//   ① 角度调校（angleTune）在 v2 上位置有两说 —— 4k 分块写的 payload[5] ↔ blob[0x01]
//      与 8k 三源交叉印证的 blob[0x70]。读 A 写 B 会让设备收到我们从未展示过的值。
//      本项目口径：**原样透传**（读到多少写回多少），UI 只读。这条最容易被"顺手改成可编辑"。
//   ② p[0]（blob[0x07]，语义未知）必须透传，绝不能清零 —— 清零会抹掉设备自己的状态。
//
// 因此这里不测"值对不对"（那需要真机），只测**字节不变式**：改任何别的项，
// 这两个字节都必须与读到的原始值一致。
import "./_domstub.js";
import { buildSensorPayload, parseBlob } from "../src/blob.js";
import { S } from "../src/state.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

/** 造一个 v2 的合法 blob：1024 字节，填几个可辨认的标记值 */
function makeBlob(): Uint8Array {
  const b = new Uint8Array(1024);
  b[0x01] = 0x07;        // angleTune 取值 7（若按有符号 24 位读则是 7）
  b[0x07] = 0x5A;        // unk7：语义未知的标志字节
  b[0x09] = 0x03;        // LOD
  b[0x0A] = 0x01;        // angleSnap
  b[0x0B] = 0x01;        // ripple
  b[0x0D] = 0x02;        // active
  b[0x0E] = 0x04;        // levels
  b[0x23] = 0x01;        // CPI1: xyOn
  b[0x24] = 0x90; b[0x25] = 0x03;   // CPI1 X = 0x0390 = 912
  b[0x27] = 0x90; b[0x28] = 0x03;   // CPI1 Y = 912
  return b;
}

/** parseBlob() 自己从 S.blob 读，所以先铺好状态再解析 */
function load(blob: Uint8Array) {
  S.blob = blob;
  S.gen = 2;
  S.xm1 = false;
  parseBlob();
}

console.log("\n[1] 语义未定的字节必须原样透传（读到什么写什么）");
{
  load(makeBlob());
  const p = buildSensorPayload();

  ok(p[0] === 0x5A,
     "p[0]（blob[0x07]，语义未知）透传为 0x5A，未被清零",
     "实得 0x" + p[0].toString(16));

  ok(p[5] === 0x07,
     "p[5]（角度调校，位置存两说）透传为读到的 0x07，未被改写",
     "实得 0x" + p[5].toString(16));
}

console.log("\n[2] 改其它项时，这两个字节不得变化（不变式）");
{
  load(makeBlob());

  // 逐个改动所有其它可写项，每次都验证 p[0] / p[5] 纹丝不动
  const mutations: [string, () => void][] = [
    ["LOD",          () => { S.stage.lodMM = 2.0; }],
    ["角度捕捉",      () => { S.stage.angleSnap = 0; }],
    ["波纹控制",      () => { S.stage.ripple = 0; }],
    ["抬离时 LED",   () => { S.stage.ledLiftoff = 0; }],
    ["启用档位数",    () => { S.stage.levels = 2; }],
    ["当前档位",      () => { S.stage.active = 1; }],
    ["CPI 1 的 X",    () => { S.stage.cpi[0][1] = 1600; }],
    ["CPI 4 的 Y",    () => { S.stage.cpi[3][2] = 3200; }],
  ];

  for (const [name, mutate] of mutations) {
    load(makeBlob());                 // 每次从同一基线重来
    const base = buildSensorPayload();
    mutate();
    const after = buildSensorPayload();

    ok(after[0] === base[0] && after[5] === base[5],
       `改「${name}」时 p[0] 与 p[5] 保持不变`,
       `p0 ${base[0]}→${after[0]}  p5 ${base[5]}→${after[5]}`);
  }
}

console.log("\n[3] 未知字段不得被静默清零（比对整帧）");
{
  load(makeBlob());
  const base = buildSensorPayload();
  S.stage.cpi[0][1] = 1600;
  const after = buildSensorPayload();

  const changed: number[] = [];
  for (let i = 0; i < base.length; i++) if (base[i] !== after[i]) changed.push(i);

  ok(changed.length > 0, "确实改动了 CPI 对应的字节（对照组）", "改动下标：" + changed.join(","));
  ok(!changed.includes(0), "改动不含 p[0]");
  ok(!changed.includes(5), "改动不含 p[5]");
}

console.log("\n结果：%d 通过 / %d 失败", pass, fail);
if (fail) process.exit(1);