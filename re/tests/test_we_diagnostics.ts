import "../_domstub.js";
import { el } from "../_domstub.js";
import { Xm2weSession } from "../../src/xm2we.js";
import { bindXm2weUI, openXm2we, closeXm2we } from "../../src/xm2we-ui.js";
import assert from "node:assert/strict";

// Reproduce a receiver that answers status queries but cannot read EEPROM.
const original = {
  readBattery: Xm2weSession.prototype.readBattery,
  readLink: Xm2weSession.prototype.readLink,
  readConfig: Xm2weSession.prototype.readConfig,
};
let writes = 0;
let packet: Record<string, unknown> | null = null;
try {
  Xm2weSession.prototype.readBattery = async function () {
    return this.battery = { pct: 75, charging: false };
  };
  Xm2weSession.prototype.readLink = async function () { return this.linkUp = true; };
  Xm2weSession.prototype.readConfig = async () => { throw new Error("EEPROM read timed out at 0x000"); };
  const device = {
    productId: 0x1961, vendorId: 0x3367, productName: "XM2we receiver", opened: false,
    collections: [{ usagePage: 0xFF02, usage: 1 }],
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener() {}, removeEventListener() {},
    async sendFeatureReport() { writes++; },
  };
  bindXm2weUI((data: string) => { packet = JSON.parse(data); });
  await openXm2we(device);
  el("btnWeDiag").onclick();
  assert.ok(packet, "diagnostics must export even when the initial EEPROM read fails");
  const diag = packet as Record<string, any>;
  assert.deepEqual(diag.we.eeprom, {});
  assert.match(diag.log, /EEPROM read timed out/);
  assert.equal(diag.we.model, "XM2we (2.4G dongle)");
  assert.equal(writes, 0, "diagnostic export must not send device commands");

  el("log").style.display = "";
  el("btnWeLog").onclick();
  assert.ok(el("cardWeTools").children.includes(el("log")), "log must be inside the visible WE tools card");
  assert.equal(el("log").style.display, "block", "first click must show the CSS-hidden log");
  el("btnWeLog").onclick();
  assert.equal(el("log").style.display, "none");
  await closeXm2we();
  packet = null;
  el("btnWeDiag").onclick();
  assert.equal(packet, null, "disconnected export still reports no device");
  console.log("WE failed-read diagnostics and log controls: passed");
} finally {
  Object.assign(Xm2weSession.prototype, original);
  await closeXm2we();
}
