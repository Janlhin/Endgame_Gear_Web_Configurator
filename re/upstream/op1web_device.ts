/**
 * WebHID transport for the OP1w 4k (gen-2 / HS dongle protocol).
 *
 * Timings and retry ladders are lifted from the vendor exe rather than tuned:
 * sub_403760 (SetFeature, 3 retries at 50 ms on the transient error set) and
 * sub_403830 (GetFeature, re-reads on status 3 with a +200 ms backoff).
 * Deviating here is what makes this device NAK.
 *
 * WebHID conventions this relies on:
 *  • sendFeatureReport(id, data) takes the payload WITHOUT the report-ID byte
 *  • receiveFeatureReport(id) also returns the frame WITHOUT a report-ID byte —
 *    but the device's own first byte is an 0xA1 echo, so index 0 is that echo,
 *    index 1 the status and index 16 the payload, matching the disassembly.
 *    Do not re-attach a report ID: it shifts every offset by one.
 *  • the device keeps one response buffer, so every read must be preceded by its
 *    own request — a bare re-read hands back the previous answer
 *  • the status byte doubles as a state code (1 ok, 3 busy, 8 cached,
 *    0x11 wireless), so payload sanity beats a strict status comparison
 */

import {
  ADVANCED,
  BASIC,
  BLOB_OFFSET,
  BLOB_SIZE,
  BASIC_WIRE_FROM_BLOB,
  BUTTON_WIRE_FROM_BLOB,
  CMD,
  CPI_MAX,
  CPI_MIN,
  CPI_STAGE_OFFSETS,
  CPI_STEP,
  KNOWN_DEVICES,
  LEN_SHORT,
  MODE,
  RID_LONG,
  RID_SHORT,
  RESET_SETTLE,
  SETTLE,
  STATUS,
  USAGE_CONFIG,
  USAGE_PAGE_CONFIG,
  WAKE_SUB,
  deviceProfile,
  ADVANCED_WIRE_FROM_BLOB,
  frame,
  hex,
  packPayload,
  parseSettings,
  payloadOf,
  writeFrame,
  type Settings,
} from './protocol';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type LogDirection = 'tx' | 'rx' | 'evt' | 'info' | 'err';

export interface LogEntry {
  seq: number;
  t: number;
  dir: LogDirection;
  label: string;
  bytes?: string;
}

export class ProtocolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function hidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

const FILTERS = KNOWN_DEVICES.map((d) => ({ vendorId: d.vendorId, productId: d.productId }));

function isKnown(d: HIDDevice): boolean {
  return KNOWN_DEVICES.some((k) => k.vendorId === d.vendorId && k.productId === d.productId);
}

/** Prefer the collection that actually advertises the config feature reports. */
function score(d: HIDDevice): number {
  let s = 0;
  for (const c of d.collections) {
    const ids = (c.featureReports ?? []).map((r) => r.reportId);
    if (ids.includes(RID_SHORT)) s += 10;
    if (ids.includes(RID_LONG)) s += 10;
    if (c.usagePage === USAGE_PAGE_CONFIG && c.usage === USAGE_CONFIG) s += 4;
    if (c.usagePage >= 0xff00) s += 1;
  }
  return s;
}


export class OP1Device {
  device: HIDDevice | null = null;
  /**
   * MODE.WIRED (0x11) or MODE.WIRELESS (0x22) — decides settle times, whether a
   * wake is needed, and whether 2k/4k polling is offered at all.
   */
  mode: number = MODE.WIRELESS;
  /** Human-readable name for the attachment that was matched. */
  label = 'OP1w 4k';

  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  onLog: ((e: LogEntry) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  /**
   * Input reports are only logged. The device is driven entirely by feature
   * reports; this channel has never been observed to fire on real hardware, and
   * battery is polled instead.
   */
  private readonly handleInput = (e: HIDInputReportEvent) => {
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    this.log('evt', `report 0x${e.reportId.toString(16)}`, d);
  };

  private readonly handleDisconnect = (e: HIDConnectionEvent) => {
    if (e.device !== this.device) return;
    // Undo attach()'s registrations here: close() bails on a null device, so
    // nulling it first would strand the listeners on the unplugged handle.
    this.detach(e.device);
    this.log('info', 'device disconnected');
    this.onDisconnect?.();
  };

  private log(dir: LogDirection, label: string, bytes?: Uint8Array, limit = 24) {
    this.onLog?.({
      seq: ++this.seq,
      t: performance.now(),
      dir,
      label,
      bytes: bytes ? hex(bytes, 0, Math.min(bytes.length, limit)) : undefined,
    });
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  private async best(): Promise<HIDDevice | null> {
    const granted = (await navigator.hid.getDevices()).filter(isKnown);
    if (!granted.length) return null;
    return granted.reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  async tryReconnect(): Promise<boolean> {
    if (!hidSupported()) return false;
    const match = await this.best();
    if (!match) return false;
    await this.attach(match);
    return true;
  }

  /**
   * Prompt for a device and attach what the user actually chose.
   *
   * best() scores across *every* granted device, which is right for a silent
   * reconnect and wrong here: with both the dongle (3367:1970) and the wired
   * mouse (3367:1972) granted, it can attach the one the user did not pick. That
   * also sets `mode` to the wrong link, and a wired device driven as wireless
   * gets a wake it must not receive — after which every write is acked and
   * silently discarded.
   *
   * So the candidates are narrowed to the picked hardware first; scoring then
   * only chooses between that device's own collections.
   */
  async request(): Promise<boolean> {
    if (!hidSupported()) throw new ProtocolError('WebHID is unavailable in this browser');
    const picked = await navigator.hid.requestDevice({ filters: FILTERS });
    if (!picked.length) return false;

    const key = (d: HIDDevice) => `${d.vendorId}:${d.productId}`;
    const wanted = new Set(picked.map(key));
    const granted = (await navigator.hid.getDevices()).filter(
      (d) => isKnown(d) && wanted.has(key(d)),
    );
    const candidates = granted.length ? granted : picked;

    await this.attach(candidates.reduce((a, b) => (score(b) > score(a) ? b : a)));
    return true;
  }

  private async attach(dev: HIDDevice) {
    // Connecting while already connected would otherwise strand an open handle
    // and its listener on the previous device.
    if (this.device && this.device !== dev) await this.close();
    if (!dev.opened) await dev.open();
    this.device = dev;
    dev.addEventListener('inputreport', this.handleInput);
    navigator.hid.addEventListener('disconnect', this.handleDisconnect);
    const profile = deviceProfile(dev.vendorId, dev.productId);
    this.mode = profile?.wired ? MODE.WIRED : MODE.WIRELESS;
    this.label = profile?.label ?? dev.productName ?? 'OP1w 4k';
    this.log(
      'info',
      `connected: ${this.label} (${dev.vendorId.toString(16)}:${dev.productId.toString(16)}, ` +
        `${this.mode === MODE.WIRED ? 'wired' : 'wireless'})`,
    );
  }

  /** Undo attach()'s registrations for `dev` and forget it. */
  private detach(dev: HIDDevice) {
    dev.removeEventListener('inputreport', this.handleInput);
    navigator.hid.removeEventListener('disconnect', this.handleDisconnect);
    if (this.device === dev) this.device = null;
  }

  async close() {
    const dev = this.device;
    if (!dev) return;
    this.detach(dev);
    if (dev.opened) await dev.close();
    this.log('info', 'closed');
  }

  get connected(): boolean {
    return !!this.device?.opened;
  }

  get settle(): number {
    return this.mode === MODE.WIRED ? SETTLE.WIRED : SETTLE.WIRELESS;
  }



  // ── Raw I/O ────────────────────────────────────────────────────────────────

  /** One command slot on the device — serialise, like the exe's critical section. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private dev(): HIDDevice {
    if (!this.device) throw new ProtocolError('Not connected', 255);
    return this.device;
  }

  private async setFeature(buf: Uint8Array, label: string): Promise<void> {
    const dev = this.dev();
    this.log('tx', label, buf);
    for (let attempt = 0; ; attempt++) {
      try {
        await dev.sendFeatureReport(buf[0], payloadOf(buf));
        return;
      } catch (err) {
        if (attempt >= 3) {
          this.log('err', `${label}: ${(err as Error).message}`);
          throw new ProtocolError(`Write failed: ${(err as Error).message}`, 20);
        }
        await sleep(50);
      }
    }
  }

  /**
   * Read and settle. Status 3 means "still computing" — the exe re-reads twice
   * with a growing delay, so do the same. Anything else is returned to the caller
   * to interpret; only the command wrappers decide what counts as fatal.
   */
  private async getFeature(reportId: number, label: string, baseWait: number): Promise<Uint8Array> {
    const dev = this.dev();
    let wait = baseWait;

    for (let attempt = 0; ; attempt++) {
      let view: DataView;
      try {
        view = await dev.receiveFeatureReport(reportId);
      } catch (err) {
        this.log('err', `${label}: ${(err as Error).message}`);
        throw new ProtocolError(`Read failed: ${(err as Error).message}`, 20);
      }
      // Chrome hands back the frame with no report-ID byte, and the device's own
      // first byte is an 0xA1 echo — so index 0 is the echo, index 1 the status,
      // and payload starts at 16, exactly as in the disassembly. Do not prepend
      // anything here: that shifts every offset by one.
      const buf = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      this.log('rx', label, buf);

      if (buf[1] !== STATUS.BUSY || attempt >= 2) return buf;
      wait += 200;
      await sleep(wait);
    }
  }

  private expectOk(buf: Uint8Array, label: string): Uint8Array {
    if (buf[1] !== STATUS.OK) {
      throw new ProtocolError(
        buf[1] === STATUS.STALE
          ? `${label}: device returned a stale buffer (status 8)`
          : `${label}: device returned status ${buf[1]}`,
        buf[1],
      );
    }
    return buf;
  }

  /** Request → settle → read → check. */
  private exchange(buf: Uint8Array, settleMs: number, label: string, reportId = RID_SHORT) {
    return this.run(async () => {
      await this.setFeature(buf, label);
      await sleep(settleMs);
      return this.expectOk(await this.getFeature(reportId, `${label} ack`, settleMs), label);
    });
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /**
   * Wake the radio link before an operation. **Wireless only.**
   *
   * Without this the dongle answers every command with status 8 and replays one
   * cached buffer — reads look plausible (the CPI region survives) while the
   * header is stale, which is exactly how bad field mappings get "confirmed".
   *
   * Mirrors sub_414950 / sub_416180: try 0x0F/0x01, fall back to 0x0F/0x0F. In
   * practice the first often answers 3 (busy) and the second answers 1.
   *
   * There is nothing to wake over a cable, and sending it anyway is actively
   * harmful: on 3367:1972 both variants answer status 7, and the 0x14 write that
   * follows is acked with status 1 and then silently discarded — the mouse keeps
   * its old settings. Verified on hardware: identical payload, wake omitted,
   * applies on the first try. This is why sub_416180 branches on the mode byte
   * and only the 0x22 (wireless) path wakes.
   */
  private async wake(): Promise<void> {
    if (this.mode === MODE.WIRED) return;
    try {
      await this.exchange(frame(CMD.WAKE_A, [WAKE_SUB.A]), 300, 'wake');
      return;
    } catch {
      /* fall through to the alternate form */
    }
    await this.exchange(frame(CMD.WAKE_A, [WAKE_SUB.B]), 300, 'wake (alt)');
  }

  /** Wake, ignoring failure — callers still validate what comes back. */
  private async tryWake(): Promise<void> {
    try {
      await this.wake();
    } catch {
      /* the caller's own status check reports the real problem */
    }
  }


  /** 'd' = dongle firmware, 'e' = mouse firmware. Both are BCD-ish: 01 10 = 1.10. */
  async readInfoBlock(which: 'd' | 'e' = 'e'): Promise<Uint8Array> {
    await this.tryWake();
    const op = which === 'd' ? CMD.INFO_D : CMD.INFO_E;
    const r = await this.exchange(frame(op), 150, `info 0x${op.toString(16)}`);
    return r.slice(BLOB_OFFSET, BLOB_OFFSET + 14);
  }

  /** Battery percentage (0..100). Confirmed: 0x28 read while the GUI showed 40%. */
  async readBattery(): Promise<number> {
    await this.tryWake();
    const r = await this.exchange(frame(CMD.READ_BYTE), 250, 'battery');
    return Math.min(r[BLOB_OFFSET], 100);
  }

  /**
   * Request the settings blob (0xA1 0x12) and read it back on report 0xA0.
   *
   * The device keeps a single response buffer: if the last command produced an
   * 0xA1 answer, reading 0xA0 hands that back instead (buf[1] lands on 0xA1
   * rather than a status). A bare re-read never clears it, so each attempt has
   * to re-issue the request.
   */
  async readSettings(): Promise<Settings> {
    await this.tryWake();
    const blob = await this.run(async () => {
      let last: Uint8Array | null = null;

      for (let attempt = 0; attempt < 4; attempt++) {
        await this.setFeature(frame(CMD.READ_BLOB), `read settings blob (try ${attempt + 1})`);
        await sleep(200 + attempt * 150);
        const r = await this.getFeature(RID_LONG, 'settings blob', 200);
        last = r;
        const blob = r.slice(BLOB_OFFSET, BLOB_OFFSET + BLOB_SIZE);
        // Status 8 is the device's "stale buffer" answer: it repeats the last
        // response for every command, so the CPI region can still look valid
        // while the header is junk. Only 1 (fresh) and 3 (computing, but the
        // payload lands) carry real settings.
        if ((r[1] === STATUS.OK || r[1] === STATUS.BUSY) && looksLikeSettings(blob)) return blob;
      }
      throw new ProtocolError(
        last?.[1] === STATUS.STALE
          ? 'The mouse is asleep — the dongle is replaying a stale buffer. ' +
            'Move or click the mouse, then read again.'
          : `Settings blob did not arrive (last status ${last ? last[1] : '—'}).`,
        last?.[1],
      );
    });
    return parseSettings(blob);
  }



  /**
   * Send only the frames whose payload actually changed.
   *
   * The UI groups settings by what they do, not by which frame carries them, so
   * one edit can straddle two frames and most edits touch only one. Comparing
   * the packed payloads before and after is exact — no bookkeeping to drift.
   */
  async writeChanged(before: Uint8Array, after: Uint8Array): Promise<string[]> {
    const changed = (map: readonly number[]) => {
      const a = packPayload(before, map);
      const b = packPayload(after, map);
      return a.some((v, i) => v !== b[i]);
    };
    // The five multiclick bytes sit in both payloads: they are the 7th byte of a
    // button record *and* the tail of the advanced frame. Diffing the raw button
    // map would therefore make a debounce edit send 0x15 plus both 0x16 blocks —
    // three settle waits for a byte one frame already carries. Detect button
    // changes on the records' own bytes and let 0x15 own the multiclick values.
    const buttonDiffMap = BUTTON_WIRE_FROM_BLOB.filter(
      (o) => !(ADVANCED.MULTICLICK as readonly number[]).includes(o),
    );

    const sent: string[] = [];
    if (changed(BASIC_WIRE_FROM_BLOB)) {
      await this.writeBasic(after);
      sent.push('basic');
    }
    if (changed(ADVANCED_WIRE_FROM_BLOB)) {
      await this.writeAdvancedBlob(after);
      sent.push('advanced');
    }
    if (changed(buttonDiffMap)) {
      await this.writeButtons(after);
      sent.push('buttons');
    }
    return sent;
  }

  /** Send the 28-byte basic-settings payload assembled from `blob`. */
  async writeBasic(blob: Uint8Array): Promise<void> {
    const payload = packPayload(blob, BASIC_WIRE_FROM_BLOB);
    await this.tryWake();
    await this.exchange(writeFrame(CMD.WRITE_BASIC, payload), this.settle, 'write basic settings');
  }

  /** Send the button mapping as the two 28-byte blocks the exe uses. */
  async writeButtons(blob: Uint8Array): Promise<void> {
    const all = packPayload(blob, BUTTON_WIRE_FROM_BLOB);
    await this.tryWake();
    for (const block of [1, 2] as const) {
      await this.exchange(
        writeFrame(CMD.WRITE_BUTTONS, all.slice((block - 1) * 28, block * 28), block),
        this.settle,
        `write buttons block ${block}`,
      );
    }
  }

  /** Send the 10-byte advanced-settings payload assembled from `blob`. */
  async writeAdvancedBlob(blob: Uint8Array): Promise<void> {
    const payload = packPayload(blob, ADVANCED_WIRE_FROM_BLOB);
    await this.tryWake();
    await this.exchange(
      writeFrame(CMD.WRITE_ADVANCED, payload),
      this.settle,
      'write advanced settings',
    );
  }


  /**
   * Factory reset — wipes every stored setting on the mouse.
   *
   * Settle times from sub_4163E0, via RESET_SETTLE: 800 ms wired, 1080 ms
   * wireless. (An earlier version of this comment had the two swapped.)
   */
  async factoryReset(): Promise<void> {
    await this.tryWake();
    await this.exchange(
      frame(CMD.FACTORY_RESET),
      this.mode === MODE.WIRED ? RESET_SETTLE.WIRED : RESET_SETTLE.WIRELESS,
      'factory reset',
    );
  }

  /** Console escape hatch: arbitrary frame in, matching ack out. */
  async raw(buf: Uint8Array, settleMs = 200, expect = RID_SHORT): Promise<Uint8Array> {
    return this.run(async () => {
      await this.setFeature(buf, 'raw');
      await sleep(settleMs);
      return this.getFeature(expect, 'raw ack', settleMs);
    });
  }
}

/**
 * Cheap plausibility check on a settings blob: the CPI stages the device says
 * are in use must sit in the sensor's range and land on a 50-count step. A stale
 * or zeroed buffer fails it.
 *
 * Only the *active* stages are checked. Demanding all four rejects a device that
 * zeroes the stages above its level count — the blob is fine, but every read
 * attempt fails and readSettings throws "Settings blob did not arrive". Stage 1
 * always has to be valid, so a zeroed buffer is still caught.
 */
function looksLikeSettings(blob: Uint8Array): boolean {
  if (blob.length < BLOB_SIZE) return false;
  const count = Math.min(Math.max(blob[BASIC.CPI_COUNT] || 1, 1), CPI_STAGE_OFFSETS.length);
  return CPI_STAGE_OFFSETS.slice(0, count).every((o) => {
    const x = blob[o + 1] | (blob[o + 2] << 8);
    const y = blob[o + 3] | (blob[o + 4] << 8);
    const ok = (v: number) => v >= CPI_MIN && v <= CPI_MAX && v % CPI_STEP === 0;
    return ok(x) && ok(y);
  });
}


export { LEN_SHORT };
