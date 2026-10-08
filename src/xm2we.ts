// XM2we / XM1（2020 有线·2.4G 代）协议层
/* 依据 okms/xm2we-linux 的 PROTOCOL.md（真机验证）+ re/upstream/xm2we_linux.py 实现。
 *
 * 与 4k 族的根本差异（务必勿混）：
 *   - 报告 ID：0x08 出 / 0x09 入（4k 族是 0xA1 / 0xA0）
 *   - 接口页：usage page 0xFF02（4k 族是 0xFF01）
 *   - 帧长  ：17 字节定长，每帧最多 10 字节数据
 *   - 校验  ：(0x55 - sum(bytes[0..15])) & 0xFF，双向同一套
 *   - 配置  ：EEPROM 逐字节读写（0x00–0xB4），不是 1024B blob
 *   - 响应  ：走 **input report 事件**（异步推送），不是 feature report 回读
 *   - 休眠  ：鼠标空闲约 4 秒即睡，EEPROM 读写需要它醒着；0x03/0x04 由接收器缓存故仍能答
 */

const WE_VID = 0x3367;
/* ★ 来自官方 **WE 系列配置工具 v1.0** 的 Cfg.ini（2026-10-09 从官方 CDN 取出并静默安装）：
     VID=0x3367
     PID=0x1960,0x1962     ← 两个鼠标 PID
     PID2=0x1961           ← 接收器
   所以 0x1960 = XM2we、0x1962 = OP1we（工具里两套皮肤 skins/3501 与 skins/3502），
   两者共用同一协议与同一份工具 —— 补上 0x1962 即支持 OP1we。 */
const WE_MOUSE_PID = 0x1960;   // XM2we（有线）
const WE_MOUSE_PID2 = 0x1962;  // OP1we（有线）
const WE_DONGLE_PID = 0x1961;  // 2.4G 接收器（两者共用）
const RPT_OUT = 0x08, RPT_IN = 0x09;
const FRAME_LEN = 17;
const EE_MAX = 10;             // [6..15] 共 10 字节，其后是校验位
const EE_LIMIT = 0xB4;         // 配置区上界（之上读出来是 0xff）

const OP_LINK = 0x03, OP_BATTERY = 0x04, OP_EE_WRITE = 0x07, OP_EE_READ = 0x08, OP_PROFILE = 0x0F;

/* 设备休眠时读 EEPROM 会直接不回应，需要反复唤醒等待 */
const WAKE_ROUNDS = 8, WAKE_PACE = 900;

/** 帧校验补码：回复有效 ⟺ 全部 17 字节之和 & 0xFF === 0x55 */
const ck = (...vals: number[]) => (0x55 - vals.reduce((a, b) => a + (b & 0xFF), 0)) & 0xFF;

function buildFrame(opcode: number, payload: number[] = []): Uint8Array {
  const b = new Uint8Array(FRAME_LEN);
  b[0] = RPT_OUT;
  b[1] = opcode;
  b[2] = 0x00;                                  // 保留
  for (let i = 0; i < payload.length && i < EE_MAX; i++) b[3 + i] = payload[i];
  b[2] = payload.length > 10 ? payload.length : b[2];  // 长负载走 data length 位
  b[16] = ck(...Array.from(b.slice(0, 16)));
  return b;
}

function frameValid(u8: Uint8Array): boolean {
  if (u8.length < FRAME_LEN) return false;
  let s = 0;
  for (let i = 0; i < u8.length; i++) s = (s + u8[i]) & 0xFF;
  return s === 0x55;
}

/* ---------- EEPROM 记录编解码 ---------- */

/** CPI：8 组 [x, y, mul, crc]。CPI = (hw + 1) * (mul ? 100 : 50)
 *  mul 是位域打包，不是布尔：
 *    X_hw = ((M & 0x0C) << 6) | x      mulX = M & 0x03
 *    Y_hw = ((M & 0xC0) << 2) | y      mulY = (M >> 4) & 0x03
 *  出厂默认 400/800/1600/3200 = 07/0f/1f/3f（M=0，纯 50 步进）。 */
function decodeCpi(mem: Map<number, number>) {
  const out: any[] = [];
  for (let i = 0; i < 8; i++) {
    const a = 0x0C + i * 4;
    const rec = [mem.get(a), mem.get(a + 1), mem.get(a + 2), mem.get(a + 3)];
    if (rec.some(v => v === undefined)) continue;
    const [x, y, m, crc] = rec as number[];
    const xHw = (((m & 0x0C) << 6) | x);
    const yHw = (((m & 0xC0) << 2) | y);
    const stepX = (m & 0x03) ? 100 : 50;
    const stepY = ((m >> 4) & 0x03) ? 100 : 50;
    out.push({
      slot: i + 1, raw: rec,
      x: (xHw + 1) * stepX, y: (yHw + 1) * stepY,
      ok: crc === ck(x, y, m),
    });
  }
  return out;
}

/** 反解：给定 CPI 值求 (x, mulX) —— 优先落在 50 步进，DPIRANGE 上段才用 100 */
function encodeCpiValue(v: number): { hw: number; mul: number } {
  const val = Math.max(50, Math.min(19000, Math.round(v / 50) * 50));
  if (val <= 10000) return { hw: val / 50 - 1, mul: 0 };
  const hw = val / 100 - 1;
  return { hw: Math.min(1023, Math.round(hw)), mul: 1 };
}

function encodeCpiRec(rec: any): number[] {
  const cx = encodeCpiValue(rec.x), cy = encodeCpiValue(rec.y);
  const x = cx.hw & 0xFF;
  const xHi = (cx.hw >> 8) & 0x03;
  const y = cy.hw & 0xFF;
  const yHi = (cy.hw >> 8) & 0x03;
  const mul = (cx.mul & 0x03) | (xHi << 2) | ((cy.mul & 0x03) << 4) | (yHi << 6);
  return [x, y, mul, ck(x, y, mul)];
}

/** 按键：16 组 [type, code, param, crc]。type 0x01 = 鼠标键位掩码 */
const BTN_BITS: [number, string][] = [[0x01, "left"], [0x02, "right"], [0x04, "middle"], [0x08, "back"], [0x10, "forward"]];

function decodeKeys(mem: Map<number, number>) {
  const out: any[] = [];
  for (let i = 0; i < 16; i++) {
    const a = 0x60 + i * 4;
    const rec = [mem.get(a), mem.get(a + 1), mem.get(a + 2), mem.get(a + 3)];
    if (rec.some(v => v === undefined)) continue;
    const [typ, code, param, crc] = rec as number[];
    let label = "";
    if (typ === 0 && code === 0) label = "(unassigned)";
    else if (typ === 0x01) {
      const names = BTN_BITS.filter(([bit]) => code & bit).map(([, n]) => n);
      label = "mouse: " + (names.length ? names.join("+") : "0x" + code.toString(16));
    } else label = "type 0x" + typ.toString(16) + " code 0x" + code.toString(16) + " param 0x" + param.toString(16);
    out.push({ slot: i + 1, raw: rec, label, ok: crc === ck(typ, code, param) });
  }
  return out;
}

function encodeKeyRec(rec: any): number[] {
  const typ = rec.raw[0] & 0xFF, code = rec.raw[1] & 0xFF, param = rec.raw[2] & 0xFF;
  return [typ, code, param, ck(typ, code, param)];
}

/** 成对标量：值后紧跟其 0x55 补码（回报率 0x00、去抖 0xA9 等） */
function paired(mem: Map<number, number>, addr: number): number | null {
  const v = mem.get(addr), c = mem.get(addr + 1);
  return v !== undefined && c === ck(v) ? v : null;
}

/** 回报率 = 1000 // mask，mask 为 one-hot：0x08=125 / 0x04=250 / 0x02=500 / 0x01=1000 Hz
 *  ⚠ 鼠标上的按钮切的是**回报率**，不是 CPI 档位——它的 1–4 闪烁很像档位指示，极易误判。 */
const POLLING_BY_MASK: Record<number, number> = { 0x08: 125, 0x04: 250, 0x02: 500, 0x01: 1000 };
const MASK_BY_POLLING: Record<number, number> = { 125: 0x08, 250: 0x04, 500: 0x02, 1000: 0x01 };

function decodePolling(mem: Map<number, number>): number | null {
  const v = paired(mem, 0x00);
  if (v === null || v === 0 || (v & (v - 1))) return null;   // 必须是恰好一个 bit
  return 1000 / v;
}

/** EEPROM 区段（协议文档表格） */
const EE_RANGES: [number, number][] = [[0x00, 0xB4]];

/* ---------- 会话 ---------- */

export class Xm2weSession {
  dev: any;
  private pending: { opcode: number; resolve: (u8: Uint8Array) => void; reject: (e: any) => void } | null = null;
  private listener: any = null;
  mem = new Map<number, number>();
  linkUp: boolean | null = null;
  battery: { pct: number; charging: boolean } | null = null;

  constructor(dev: any) {
    this.dev = dev;
    this.listener = (e: any) => {
      const p = this.pending;
      if (!p) return;
      const dv: DataView = e.data;
      const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      if (!bytes.length) return;
      // input report 事件的 data 不含 reportId；opcode 在 data[1]（对应帧内 [1]）
      if (bytes[0] !== p.opcode && bytes[1] !== p.opcode) return;
      const norm = new Uint8Array(FRAME_LEN);
      norm[0] = RPT_IN;
      norm.set(bytes.subarray(0, Math.min(bytes.length, FRAME_LEN)), 1);
      if (!frameValid(norm)) return;
      this.pending = null;
      p.resolve(norm);
    };
    dev.addEventListener("inputreport", this.listener);
  }

  dispose() {
    try { this.dev.removeEventListener("inputreport", this.listener); } catch (_) {}
    this.pending = null;
  }

  /** 发一帧并等对应回复（input report 异步推送，带超时） */
  private async transact(opcode: number, payload: number[] = [], timeoutMs = 1200): Promise<Uint8Array> {
    const frame = buildFrame(opcode, payload);
    const data = frame.slice(1);          // sendFeatureReport 的 data 不含 reportId
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending && this.pending.opcode === opcode) this.pending = null;
        reject(new Error("0x" + opcode.toString(16) + " 超时无响应（鼠标可能在休眠）"));
      }, timeoutMs);
      this.pending = {
        opcode,
        resolve: u8 => { clearTimeout(timer); resolve(u8); },
        reject: e => { clearTimeout(timer); reject(e); },
      };
      this.dev.sendFeatureReport(RPT_OUT, data).catch(e => {
        if (this.pending && this.pending.opcode === opcode) this.pending = null;
        clearTimeout(timer);
        reject(new Error("SET_REPORT 失败: " + e.message));
      });
    });
  }

  /** 链路状态：data[1] = 1 在线。接收器有缓存，即使鼠标睡了也能答。 */
  async readLink(): Promise<boolean | null> {
    try {
      const r = await this.transact(OP_LINK);
      const n = r[5] || 0;
      this.linkUp = n >= 1 ? !!r[6] : null;
      return this.linkUp;
    } catch (e) { this.linkUp = null; return null; }
  }

  /** 电量：data[0] = 百分比，data[1] = 充电标志。
   *  ⚠ 先读电量再看链路：插线瞬间链路会短暂断开，但电量仍有效。 */
  async readBattery(): Promise<{ pct: number; charging: boolean } | null> {
    try {
      const r = await this.transact(OP_BATTERY);
      const n = r[5] || 0;
      if (n < 1 || r[6] > 100) return null;
      const b = { pct: r[6], charging: n > 1 ? !!r[7] : false };
      this.battery = b;
      return b;
    } catch (e) { return null; }
  }

  /** EEPROM 读 n 字节（n ≤ 10）。响应 data 区在 [6..]，地址回显在 [3..4]。 */
  private async eeRead(addr: number, n: number, timeoutMs = 1200): Promise<number[] | null> {
    const r = await this.transact(OP_EE_READ, [0x00, (addr >> 8) & 0xFF, addr & 0xFF, n], timeoutMs);
    const got = (r[3] << 8) | r[4];
    if (r[5] !== n || got !== addr) return null;
    return Array.from(r.slice(6, 6 + n));
  }

  /** EEPROM 写。写后由调用方回读校验。 */
  private async eeWrite(addr: number, data: number[]): Promise<boolean> {
    const payload = [0x00, (addr >> 8) & 0xFF, addr & 0xFF, data.length, ...data];
    await this.transact(OP_EE_WRITE, payload, 1500);
    return true;
  }

  /** 读整片配置区。鼠标睡着时会一直不答，故先查链路再轮询等待唤醒。 */
  async readConfig(onProgress?: (done: number, total: number) => void): Promise<Map<number, number>> {
    const mem = new Map<number, number>();
    let total = 0;
    for (const [lo, hi] of EE_RANGES) total += hi - lo + 1;
    let done = 0;

    for (const [lo, hi] of EE_RANGES) {
      let addr = lo;
      while (addr <= hi) {
        const n = Math.min(EE_MAX, hi - addr + 1);
        let got: number[] | null = null;
        // 唤醒重试：链路断 → 提示用户动一下鼠标；链路边断边等则继续轮询
        for (let round = 1; round <= WAKE_ROUNDS && !got; round++) {
          if (round > 1) {
            const up = await this.readLink();
            if (up === false && round >= 3) throw new Error("mouse asleep");
            await new Promise<void>(r => setTimeout(r, WAKE_PACE));
          }
          try { got = await this.eeRead(addr, n, round === 1 ? 700 : 1200); }
          catch (e) { got = null; }
        }
        if (!got) throw new Error("EEPROM read timed out at 0x" + addr.toString(16).padStart(3, "0"));
        got.forEach((b, i) => mem.set(addr + i, b));
        addr += n;
        done += n;
        onProgress?.(done, total);
      }
    }
    this.mem = mem;
    return mem;
  }

  /** 写入一条记录并回读验证（协议文档明确要求 read-back verify） */
  async writeRecord(addr: number, bytes: number[]): Promise<boolean> {
    if (addr < 0 || addr + bytes.length - 1 > EE_LIMIT) throw new Error("地址超出配置区 0x00–0xB4");
    await this.eeWrite(addr, bytes);
    const back = await this.eeRead(addr, bytes.length, 1500);
    if (!back) throw new Error("写入后回读失败 @0x" + addr.toString(16));
    for (let i = 0; i < bytes.length; i++)
      if (back[i] !== bytes[i]) throw new Error("回读不一致 @0x" + (addr + i).toString(16) + "：期望 " + bytes[i] + " 实得 " + back[i]);
    for (let i = 0; i < bytes.length; i++) this.mem.set(addr + i, back[i]);
    return true;
  }

  /* ---------- 高层字段 ---------- */
  cpiTable() { return decodeCpi(this.mem); }
  keyTable() { return decodeKeys(this.mem); }
  polling() { return decodePolling(this.mem); }
  debounce() { return paired(this.mem, 0xA9); }
  /** CPI 指示灯颜色：8 组 [r,g,b,crc] @0x2C */
  ledColors() {
    const out: any[] = [];
    for (let i = 0; i < 8; i++) {
      const a = 0x2C + i * 4;
      const rec = [this.mem.get(a), this.mem.get(a + 1), this.mem.get(a + 2), this.mem.get(a + 3)];
      if (rec.some(v => v === undefined)) continue;
      const [r, g, b, crc] = rec as number[];
      out.push({ slot: i + 1, rgb: [r, g, b], ok: crc === ck(r, g, b) });
    }
    return out;
  }

  async writeCpiSlot(slot: number, x: number, y: number) {
    const addr = 0x0C + (slot - 1) * 4;
    await this.writeRecord(addr, encodeCpiRec({ x, y }));
  }
  async writePolling(hz: number) {
    const mask = MASK_BY_POLLING[hz];
    if (!mask) throw new Error("回报率只支持 125/250/500/1000 Hz");
    await this.writeRecord(0x00, [mask, ck(mask)]);
  }
  async writeDebounce(ms: number) {
    const v = Math.max(0, Math.min(255, Math.round(ms)));
    await this.writeRecord(0xA9, [v, ck(v)]);
  }
  async writeKeySlot(slot: number, raw: number[]) {
    await this.writeRecord(0x60 + (slot - 1) * 4, encodeKeyRec({ raw }));
  }
  async writeLedColor(slot: number, r: number, g: number, b: number) {
    const [R, G, B] = [r & 0xFF, g & 0xFF, b & 0xFF];
    await this.writeRecord(0x2C + (slot - 1) * 4, [R, G, B, ck(R, G, B)]);
  }

  /** EEPROM 全量导出（hex 文本，便于外部比对/备份） */
  dumpHex(): string {
    const lines: string[] = [];
    for (const [lo, hi] of EE_RANGES) {
      for (let row = lo; row <= hi; row += 16) {
        const cells: string[] = [];
        for (let a = row; a <= Math.min(row + 15, hi); a++) {
          const v = this.mem.get(a);
          cells.push(v === undefined ? "--" : v.toString(16).padStart(2, "0"));
        }
        lines.push(row.toString(16).padStart(4, "0") + ": " + cells.join(" "));
      }
    }
    return lines.join("\n");
  }

  toJSON() {
    return {
      app: "endgame-gear-web-configurator", family: "xm2we", savedAt: new Date().toISOString(),
      polling: this.polling(), debounce: this.debounce(),
      cpi: this.cpiTable(), keys: this.keyTable(), led: this.ledColors(),
      memHex: this.dumpHex(),
    };
  }
}

/** 从 hid.requestDevice 返回值里挑出 XM2we/OP1we 族设备
 *  （有线 0x1960 / 0x1962、接收器 0x1961，接口页 0xFF02） */
function isXm2weFamily(pid: number, collections?: any[]): boolean {
  if (pid === WE_MOUSE_PID || pid === WE_MOUSE_PID2 || pid === WE_DONGLE_PID) return true;
  return !!collections?.some(c => c.usagePage === 0xFF02);
}

export { WE_VID, WE_MOUSE_PID, WE_MOUSE_PID2, WE_DONGLE_PID, RPT_OUT, RPT_IN, FRAME_LEN, EE_LIMIT, OP_PROFILE,
         POLLING_BY_MASK, MASK_BY_POLLING, BTN_BITS, ck, buildFrame, frameValid,
         decodeCpi, encodeCpiRec, decodeKeys, decodePolling, encodeCpiValue, paired, isXm2weFamily };
