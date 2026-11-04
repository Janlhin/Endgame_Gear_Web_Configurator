# Test Checklist (for remote volunteers / my own regression testing)

> How to use: jump to the section for your model and tick items off one by one. Every item states **how to test**, **what counts as pass**, and
> **what a failure tells us** — a "fail" is a valid result too; reporting it honestly is worth more than leaving it blank.
>
> Companions:
>
> - Data export: the "Export test data packet (.json)" button on the page (model / PID / firmware / interface collection / blob / logs in one file)
> - Volunteer process: [`docs/remote-beta-guide.en.md`](https://github.com/Janlhin/Endgame_Gear_Web_Configurator/blob/main/docs/remote-beta-guide.en.md)
> - XM1 differential experiments: [`docs/xm1-diff-kit.md`](https://github.com/Janlhin/Endgame_Gear_Web_Configurator/blob/main/docs/xm1-diff-kit.md)
>
> ⚠️ Universal red line: **change one value at a time**; let the page auto-export a backup before changing anything;
> if you see a "read-back mismatch", **stop** — do not retry.

---

## 0. Environment & connection (run through for every model)

- [ ] Browser and version? (Chrome / Edge both fine; Firefox / Safari have no WebHID — failing to connect there is expected)
- [ ] Does the page banner say "no WebHID in this environment"? If so, switch browsers; no point testing further
- [ ] After clicking "Connect", can you see your mouse/receiver in the device list? Write down the device name
- [ ] After connecting, **does the pointer still move normally?** (If not = wrong interface picked; just close the tab to recover, and tell me)
- [ ] Is the model name shown by the page correct? If not, send both the actual model and what the page shows
- [ ] Was the firmware version read out? What is it (e.g. `1.37`)? What does the official tool show?
- [ ] Is the battery reading (wireless) plausible? How far off from how the mouse actually feels?
- [ ] Click "Export test data packet" — does the file generate correctly? (Save it; every later step uses it)
- [ ] **Click "Re-read" twice in a row — are the blobs in the two exported packets byte-for-byte identical?**
      (Differing byte offsets: ______________________)
      ⚠️ This is the precondition for "differential locating": if some bytes change every time, they cannot be used to find fields.
      If the two match → please send the second file too; blank data like this is valuable to us

---

## 1. The entire 8k wired family (XM2 8k / OP1 8k / Purple Frost / both v2s) — the most needed tier

> For this tier our protocol is cross-corroborated by "official binaries + four community implementations", **but it has never touched real hardware**.
> Writes are off by default; one click shows a confirmation — after confirming it applies only to that connection.

**Is reading correct**

- [ ] Does the config read out after connecting? (The log should show `✓ 8k blob read OK`)
- [ ] Do the **four CPI slots** parsed by the page match what you set in the official tool? Write each one out for comparison
- [ ] Is the parsed **polling rate** right? (8000 / 4000 / 2000 / 1000 Hz)
- [ ] Is the parsed **LOD** right? (v1: 0.7 / 1 / 2 mm; v2: 0.7–1.7 mm)
- [ ] Do the Angle Snap / Ripple / Motion Sync toggles match the official tool?

**Is writing effective** (record after every single change)

- [ ] Change **only CPI slot 1** (e.g. 800 → 1600) → does the page report "read-back verified"?
- [ ] ⭐ **Does the actual feel/speed change? Is it a 1:1 change, or off by roughly an order of magnitude?**
      (An order of magnitude = we misunderstood the CPI encoding — this is the single most important item)
- [ ] Change **polling rate** → read-back passes? Does the official tool confirm it really changed?
- [ ] Change **LOD** → read-back passes? Does the lift-off feel change?
- [ ] Toggle **Angle Snap / Ripple / Motion Sync** → read-back passes?
- [ ] Does your model support **glass mode** (v2 and Purple Frost only)? Does toggling it do anything?
- [ ] Does "Factory reset" work? (**Irreversible** — do this last)

**Buttons (our least confident area)**

- [ ] Does the button mapping read by the page match what you actually set? (We parse as "7 entries × 7 bytes, starting at blob 0x3D")
- [ ] If you change one button mapping in the official tool, does the page show the change after re-reading?

---

## 2. The WE family (XM2we) — ✅ closed on 2026-11-04, only OP1we remains

> One XM2we owner took this family all the way on real hardware (issue #1): reads over both the
> cable (`0x1960`) and the receiver (`0x1961`), writes over both, the LOD mapping, and CPI /
> polling / debounce — all matching the official tool item by item.
> What follows keeps **the confirmed results** and **what is still open**, for whoever has an OP1we.

### Confirmed — no need to repeat

- Read: 181 bytes (`0x00–0xB4`), at most 10 bytes per frame, ~19 round trips; **cable and receiver produce byte-identical dumps**
- Write: a single CPI stage change takes effect **immediately**, no mouse restart; restoring returned all 181 bytes **byte-identical** to the backup
- Field map: `0x02` enabled stage count / `0x04` current active stage (**zero-based**) / `0x0A` LOD (1 = 1 mm, 2 = 2 mm) / `0xA9` debounce
- Unchanged fields are **no longer rewritten** (the log says "no fields changed")
- The "in use" marker now follows `0x04` instead of being hardcoded to slot 1

### Still to test (whoever has an OP1we)

- [ ] Does OP1we connect at all? (cable `0x1962` / receiver `0x1961`)
- [ ] Can it read 181 bytes? Do the field offsets match XM2we?
- [ ] Single-stage CPI write → read-back matches? Does the official tool agree?

### Still unconfirmed (doesn't block use; a known unknown)

- The unit of the `0xAD` sleep value (the vendor tool shows raw × 10) — so the UI **displays it read-only and never writes it**

---

## 3. 4k wireless (XM2w / OP1w 4k and v2) — regression: don't let it degrade

> These models are hardware-verified; what you are testing is "did this change break anything".

- [ ] Reading works, CPI / polling / LOD / toggle states all match the official tool?
- [ ] Change CPI → read-back verification passes?
- [ ] Change independent X/Y CPI (X ≠ Y) → does it take effect? (A feature the official tool doesn't have)
- [ ] **Export config → change a few values → import the file you just exported → does it restore correctly?**
- [ ] Import a config file from a **different generation** (e.g. a v2 config into a v1 mouse) → it should be rejected with a message,
      not written through. Is that what happens?
- [ ] Is the wireless write wait long enough? (Wired 500 ms / wireless 880 ms; any read-back mismatch after writes?)
- [ ] What happens if you click Read while the mouse is asleep? (There should be a "move the mouse" hint, not a cryptic error)
- [ ] Is the battery reading stable?
- [ ] (If you dare) pairing commands: hold left+right+middle for 3 seconds, then click "Re-pair receiver" — can it reconnect?

---

## 4. XM1 / XM1 RGB — local differential work (I run it myself)

An experiment kit is ready, see [`docs/xm1-diff-kit.md`](https://github.com/Janlhin/Endgame_Gear_Web_Configurator/blob/main/docs/xm1-diff-kit.md). Each item is "change one value in the official software → export → run `re/xm1_diff.py`":

- [ ] Experiment 1: lighting (Mode / Speed / Strength / LED colors ×3 / LED ON) — 5 sub-items
- [ ] Experiment 2: button mapping (one left button, one side button)
- [ ] Experiment 3: Angle Snap / Smoothing / Angle Tune
- [ ] Experiment 4: the bottom toggle switch / bottom button (watch that `blob[0]` byte)

---

## 5. XM1r / OP1 / OP1 RGB (the fourth protocol family)

This tool **recognizes only, communicates never**. One thing to confirm:

- [ ] When plugged in, does the page show "fourth protocol family… please use the official tool"? (If so, recognition is correct)

---

## 6. Report template (copy into an issue / email as-is)

```text
Mouse model:
PID / VID:
Firmware version (page / official tool):
Browser and version:
Connection (wired / receiver):

[ ] Reading works
[ ] Parsed values match the official tool (mismatches:                )
[ ] Write read-back passes (failures:                                 )
[ ] Actual feel/speed really changed (unchanged items:                )

Surprises:
Attachments: egg-mouse-diag-*.json (test data packet)
```

---

## 7. Quick diagnosis (symptom → likely cause)

| Symptom | Most likely |
|---|---|
| Read-back mismatch, and the delta is a clean multiple (×2, ×10) | CPI / step encoding misunderstood |
| Read-back matches but the feel doesn't change | Offset right, semantics wrong (writing another field) |
| Nothing reads at all | Wrong interface collection, or wrong family detected (check the usage page in the log) |
| Wireless times out, wired is fine | Mouse asleep / wake-up timing too short |
| Page freezes, pointer stops moving | Pointer interface opened by mistake (closing the tab recovers it) |
