// XM2we 协议编解码离线仿真：用 PROTOCOL.md 记载的真机事实验证往返一致性
import { buildFrame, frameValid, decodeCpi, encodeCpiRec, encodeCpiValue, decodeKeys,
         decodePolling, paired, ck, POLLING_BY_MASK } from "../src/xm2we.js";

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

/* ---- 1. 帧编解码 ---- */
console.log("[1] 帧与校验");
{
  const f = buildFrame(0x08, [0x00, 0x00, 0x0C, 0x04]);
  ok(f.length === 17, "帧长 17 字节");
  ok(f[0] === 0x08 && f[1] === 0x08, "报告 ID / opcode");
  ok(frameValid(f), "自校验和成立（sum≡0x55）");
  // 协议文档实况：写入 400cpi 的 4 字节 = 07 07 00 47
  const rec = encodeCpiRec({ x: 400, y: 400 });
  ok(rec.length === 4 && rec[0] === 0x07 && rec[1] === 0x07 && rec[2] === 0x00 && rec[3] === 0x47,
     "400 CPI 编码 == 文档记载 07 07 00 47", Array.from(rec).map(b => b.toString(16).padStart(2, "0")).join(" "));
}

/* ---- 2. CPI 往返 ---- */
console.log("[2] CPI 表解码（出厂默认 400/800/1600/3200）");
{
  const mem = new Map<number, number>();
  const defaults = [400, 800, 1600, 3200];
  defaults.forEach((v, i) => { encodeCpiRec({ x: v, y: v }).forEach((b, k) => mem.set(0x0C + i * 4 + k, b)); });
  const t = decodeCpi(mem);
  ok(t.length === 4, "解出 4 档", String(t.length));
  defaults.forEach((v, i) => ok(t[i].x === v && t[i].y === v, `档${i + 1} == ${v}`, `${t[i]?.x}x${t[i]?.y}`));
  ok(t.every(r => r.ok), "全部 crc 校验通过");

  // 协议文档实测：slot 存 0x1f → 预测 1600（实测 1580，1.2% 误差）
  const m2 = new Map<number, number>(); m2.set(0x0C, 0x1f); m2.set(0x0D, 0x1f); m2.set(0x0E, 0x00);
  m2.set(0x0F, ck(0x1f, 0x1f, 0x00));
  const one = decodeCpi(m2)[0];
  ok(one.x === 1600, "裸值 0x1f → 1600 CPI（文档实测基准）", String(one.x));

  // 往返：按文档 DPIRANGE 的真实合法网格扫描（50–10000 步进 50，10100–19000 步进 100）
  const legal: number[] = [];
  for (let v = 50; v <= 10000; v += 50) legal.push(v);
  for (let v = 10100; v <= 19000; v += 100) legal.push(v);
  let bad = 0, worst = "";
  for (const v of legal) {
    const m = new Map<number, number>();
    encodeCpiRec({ x: v, y: v }).forEach((b, k) => m.set(0x0C + k, b));
    const got = decodeCpi(m)[0];
    if (got.x !== v) { bad++; if (!worst) worst = `${v}→${got.x}`; }
  }
  ok(bad === 0, `CPI 往返全等（合法网格 ${legal.length} 档：50–10000/50 + 10100–19000/100）`,
     bad ? `${bad} 处失配，首例 ${worst}` : "");

  // 非法格点（如 10050）必须吸附到最近合法值，绝不静默产生错档
  const off = new Map<number, number>();
  encodeCpiRec({ x: 10050, y: 10050 }).forEach((b, k) => off.set(0x0C + k, b));
  const snapped = decodeCpi(off)[0].x;
  ok(snapped === 10000 || snapped === 10100, "越界值 10050 吸附到合法档 " + snapped, String(snapped));
  ok(encodeCpiValue(19000).mul === 1, ">10000 走 100 步进段");
  ok(encodeCpiValue(10100).hw === 100, "10100 的 hw == 100（对照文档 DPIRANGE 上段）");
}

/* ---- 3. 回报率 one-hot ---- */
console.log("[3] 回报率掩码");
{
  const mem = new Map<number, number>();
  mem.set(0x00, 0x04); mem.set(0x01, ck(0x04));          // 文档实测：字段读 0x04 时报告间隔 4.00ms = 250Hz
  ok(decodePolling(mem) === 250, "mask 0x04 → 250 Hz");
  ok(POLLING_BY_MASK[0x08] === 125 && POLLING_BY_MASK[0x01] === 1000, "125/1000 掩码对应");
  const m2 = new Map<number, number>(); m2.set(0x00, 0x02); m2.set(0x01, ck(0x02));
  ok(decodePolling(m2) === 500, "mask 0x02 → 500 Hz");
  // 非 one-hot 必须拒绝
  const m3 = new Map<number, number>(); m3.set(0x00, 0x06); m3.set(0x01, ck(0x06));
  ok(decodePolling(m3) === null, "多位掩码被拒（null）");
  // 补码不匹配也拒绝
  const m4 = new Map<number, number>(); m4.set(0x00, 0x02); m4.set(0x01, 0x99);
  ok(decodePolling(m4) === null, "补码失配被拒");
}

/* ---- 4. 按键记录 ---- */
console.log("[4] 按键矩阵");
{
  const mem = new Map<number, number>();
  [[0x01, 0x01], [0x01, 0x08], [0x00, 0x00]].forEach(([typ, code], i) => {
    const a = 0x60 + i * 4;
    mem.set(a, typ); mem.set(a + 1, code); mem.set(a + 2, 0x00); mem.set(a + 3, ck(typ, code, 0x00));
  });
  const t = decodeKeys(mem);
  ok(t.length === 3, "解出 3 条");
  ok(/left/.test(t[0].label), "左键识别", t[0].label);
  ok(/back/.test(t[1].label), "后退识别", t[1].label);
  ok(/unassigned/.test(t[2].label), "未分配识别", t[2].label);
  ok(t.every(r => r.ok), "crc 全通过");
  // 篡改 crc 必须被标记为坏记录
  mem.set(0x63, 0x00);
  ok(!decodeKeys(mem)[0].ok, "坏 crc 被标记");
}

/* ---- 5. 成对标量 ---- */
console.log("[5] 去抖 0xA9");
{
  const mem = new Map<number, number>();
  mem.set(0xA9, 8); mem.set(0xAA, ck(8));
  ok(paired(mem, 0xA9) === 8, "去抖值解出 8");
  ok(paired(mem, 0xA9) === paired(mem, 0xA9), "幂等");
  ok(paired(new Map(), 0xA9) === null, "空区返回 null");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
