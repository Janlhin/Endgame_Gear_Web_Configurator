# Remote Volunteer Testing Guide (unverified models)

**[简体中文](remote-beta-guide.md) | English**

> For people who own **mice we don't** (the entire 8k wired family, XM2we / OP1we).
> Every real-hardware test you run is the only way this project moves forward — provided you **don't write your mouse into a brick**.
>
> This tool is **read-only by default** for these models. To write, you must click through one confirmation; it then applies only to that connection,
> and reloading the page or unplugging the device silently returns it to read-only.
>
> **What exactly to test → see [`docs/test-checklist.en.md`](test-checklist.en.md)** (this guide covers process and risks only).
>
> **Just work through [`docs/test-checklist.en.md`](test-checklist.en.md) item by item** — every item states how to test,
> what counts as pass, and what a failure tells us. This guide and that checklist go together.

---

## 1. Before you start (required, two minutes)

1. **Screenshot the current config in the official tool**, or note down: the four CPI slots, polling rate, LOD.
2. **Know how to recover**: the official tool has "factory reset". If a write goes wrong, that's your way back.
3. Open this tool in **Chrome or Edge** (`index.html`) — not Firefox / Safari (no WebHID there).

## 2. First write (a confirmation dialog will appear)

1. Connect your mouse → wait for the config to read out.
2. The page will warn "this model is not hardware-verified". That's normal — nothing is wrong with your device.
3. **Change one value only** (CPI slot 1 is a good first change, e.g. 800 → 1600), click "Apply".
4. A confirmation dialog explains the risks. **Before you confirm, the page automatically exports a backup of the current config — save it somewhere safe first.**
5. After writing, the page **reads back once and shows the verification result**:
   - "Read-back verified" → note it down;
   - "Read-back mismatch" with a list of items → **do not retry**, send me the log.

## 3. Send the results back (one step)

Click **"Export test data packet (.json)"** (in the tools card; XM2we / OP1we have it on their own card).
That single file already contains:

- Model name, **VID / PID**, **interface collection (usage page)** — the primary evidence for family detection
- Firmware version (mouse / receiver), battery, wired or wireless
- All parsed settings (four CPI slots, polling rate, LOD, angle, filters…)
- **The full 1024B config blob** (base64 + hex side by side) — or the EEPROM dump and decoded table for the WE family
- **The full communication log** of the session

The packet also includes a `report` template. Please fill in these four fields:

| Field | What to put |
|---|---|
| `modelSeen` | The model shown on the page (copy as-is, no need to edit) |
| `changed` | e.g. "CPI slot 1: 800 → 1600" |
| `readBack` | Did the page report "read-back verified", or list mismatches |
| `feltDifferent` | ★ **Did the actual feel / speed really change** |

> The single most important item: **after the change, did the feel / actual speed really change?**
> A read-back verification only proves "the mouse stored the number I sent", not "that number means what you intended".
> E.g. if CPI 1600 feels twice as fast as it should, our encoding understanding is wrong — that feedback is worth more than anything.

## 4. If something goes wrong

| Symptom | What to do |
|---|---|
| Mouse unusable after a write / speed is absurd | Use "factory reset" in the official tool, or import the backup auto-exported in step 4 |
| Page reports "read-back mismatch" | **Stop retrying**, send me the log |
| Won't connect / won't read | Try another USB port, unplug and replug; for a wireless mouse, move it first to wake it |
| Page frozen, pointer not moving | Just close the tab to recover (the tool never opens the pointer interface) |

## 5. Known non-applicable operations

- **Import config**: disabled for the whole 8k family (full-blob overwrite, risk too high); all other models only accept configs from the **same generation**.
- **Pairing commands**: meaningless for wired 8k, the UI disables them.
- **Factory reset**: available, but requires two confirmations, and is **irreversible**.
