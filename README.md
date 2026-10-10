# Endgame Gear Web Configurator

**English** | [简体中文](README.zh-CN.md)

A browser-based tool that configures Endgame Gear wireless gaming mice directly — **no driver, no installation**: open the page → click connect → change settings.

Built on Chrome/Edge's **WebHID** API, talking to the mouse's or receiver's configuration channel through HID feature reports. The protocol implementation comes from a complete community reverse-engineering of the official Windows tools (see [Acknowledgements](#acknowledgements)), and it reproduces all of the official tools' timing quirks.

> **Two protocol families coexist**: Endgame Gear is not a single-protocol product line. The 4k wireless family uses interface `0xFF01` + `0xA0`/`0xA1` reports + a 1024B config blob; the 2020-era XM2we/XM1 wired family uses interface `0xFF02` + `0x08`/`0x09` reports + 17-byte checksummed frames + EEPROM config. This tool supports both and auto-routes by PID on connect.

## Supported devices

| Model | Protocol family | Wireless (dongle PID) | Wired (mouse PID) | Status |
|---|---|---|---|---|
| XM2w 4k | 4k wireless v1 | `0x1970` | `0x1968` / `0x1969` | ✅ Full support |
| OP1w 4k | 4k wireless v1 | `0x1970` | `0x1972` | ✅ Full support |
| XM2w 4k v2 | 4k wireless v2 | `0x1970` | `0x1982` / `0x1981` | ✅ Full support |
| OP1w 4k v2 | 4k wireless v2 | `0x1984` | `0x1984` | ✅ Full support |
| **XM2we / OP1we** | **2020 wired/2.4G** | `0x1961` | `0x1960` / **`0x1962`** | 🧩 Code ready (29 offline simulation assertions pass), **not verified on real hardware** (未真机验证). OP1we's PID `0x1962` comes from the official WE tool's `Cfg.ini` |
| XM2 8k (`0x1966`) / XM2 8k v2 (`0x1980`) | **8k wired** (isomorphic to the 4k family) | — | `0x1966` / `0x1980` | ✅ **Read + write** — blob offsets are byte-for-byte identical to the 4k family; writes use **`0x11` whole-blob write** (read-modify-write), cross-corroborated by three sources (official tool binary + `egctl` + `qsxcv`), **not verified on real hardware** (未真机验证) |
| OP1 8k / Purple Frost (`0x1964`) / OP1 8k v2 / Raw Input (`0x1978`) | **8k wired** | — | `0x1964` / `0x1978` | ✅ **Read + write** — same as above |
| OP1 / OP1 RGB | **Fourth protocol family** (VID `0x3367`) | — | `0x1903` / `0x1905` / `0x1906` / `0x1910` | 🔍 **Recognized only, no communication** — interface page `0xFFA1`, 64B packets + 54 `kCom*` commands + 32B passphrase; see `re/FAMILY4_NOTES.md` |
| XM1 / XM1 RGB | 2020 wired (VID `0x22D4` / PID `0x1803`) | — | — | ✅ **Read + write** (CPI 4 slots / LOD / Ripple; writes limited to fields confirmed by real-hardware testing — 实测确认. CPI is single-value — firmware reads X only, independent XY not supported) |
| XM1r | **Fourth protocol family** (VID `0x3367`) | — | `0x1903` | 🔍 **Recognized only, no communication** — same platform as OP1 (shares PID `0x1903`) |

> ### ⚠️ XM1 support — read + restricted write (2026-10-09)
>
> **XM1 supports reading, plus a restricted subset of writes** (see "Writing is now available" at the end of this section).
>
> **Reading**: only a 64-byte **payload-free** request is sent (`A1 07` + all zeros) to trigger it, then 1041 bytes are read back via GetFeature (status byte at `[1]`, 1024B blob at offset 16). Verified on real hardware (真机验证); the CPI / LOD / Ripple values read match the official software item by item. **The message carries no config data and will not modify the mouse.**
>
> **Incident record (historical, now fixed)**: early versions of this web tool mistook the official **write path** for the read path, sending XM1 a 1041-byte `0xA0` bulk report whose 1024-byte payload was **all zeros**. The device interpreted this as "write an empty config", which **zeroed the user's DPI / CPI**. The root cause is a layer of unverified reordering between the vendor's internal layout and the wire layout (official function `0x40FD60`, 298 move operations) — sending any payload-bearing message before semantics are confirmed is gambling.
>
> Code-level protection (since upgraded from a blanket ban to a **precise boundary** as write verification progressed): the send-layer whitelist admits only three message classes — ① payload-free read queries `{0x03, 0x07}`; ② blob writes (outside the **23 offsets confirmed by real-hardware testing** — 实测确认 — the other 1001 bytes must be byte-for-byte identical to what was just read back); ③ single-byte writes (the value must equal `blob[0]`). Anything out of bounds is blocked and disarmed.
>
> **Polling rate caveat**: XM1's polling rate is a **3-position hardware toggle switch on the underside of the mouse** (`250Hz` / `500Hz` / `1000Hz`, with an LED beside it indicating the current position), read via GPIO and **not written to config storage** — so in practice toggling it leaves the 1041B blob **completely unchanged**, and software cannot set it. This tool therefore offers **no** polling-rate control for XM1. XM1 does not support 125Hz. (Separately, the firmware has a single-byte command channel `cmd 0x03` for read / `cmd 0x04` for write; its semantics are unconfirmed, so it is currently read-only.)
>
> **Real-hardware model**: M/N `EGG-XM1-WHT` (XM1 White), firmware 2.29.
>
> **To modify an XM1, use the official `XM1 Configuration Software v1.09`** (firmware must be 2.29). The full field table and differential evidence are in sections 6.5–6.14 of `re/XM1_NOTES.md`.
>
> **Writing is now available (verified on real hardware 2026-10-09)**: echo write-back round-trips succeeded with byte-for-byte identical read-back, proving reads and writes share one layout. XM1 now allows editing **CPI 4 slots (independent X/Y) / Lift Cut-Off / Ripple**, but writes are hard-limited to the **23 bytes confirmed by real-hardware testing** — the other 1001 bytes must match the read-back values exactly, enforced by the send layer (covered by regression test `re/test_xm1_write.ts`). A snapshot is taken automatically before each read/write for one-click rollback; a diff preview runs before applying, and a read-back verification runs after writing. **Polling rate remains a bottom-side hardware switch that software cannot change.** Fields that have not been located (Angle/Smoothing/lighting/key mapping) are not writable.

## The UI adapts to the connected model (only that model's settings are shown)

**No "show everything and disable the rest"** — disabled items are both noise and a way of hiding the fact that "this model simply doesn't have that feature". The UI is decided in one place, `src/layout.ts`, and re-arranges itself once a connected device is identified:

| Connected device | Cards shown | Items hidden within those cards |
|---|---|---|
| **XM1** | Device info · Sensor/CPI · Backup tools | Glass mode, angle snap, lift-off LED, angle tuning (**offsets not located** — 偏移未定位); the entire "Performance/Power" card (polling rate is a **bottom-side hardware switch**); the "Key mapping" card (key table unverified); receiver firmware and battery rows. The CPI header is **single-value** (firmware reads X only) |
| **4k wireless v1** (XM2w 4k / OP1w 4k) | All five cards | Glass mode, angle tuning, forced max FPS, multi-click filter (all v2 additions) |
| **4k wireless v2** (XM2w 4k v2 / OP1w 4k v2) | All five cards | Jitter filter (v1 only) |
| **8k wired family** | Device info · Sensor/CPI · Performance/Power · Backup tools | LOD (family-specific list, encoding unverified), glass mode / lift-off LED / angle tuning / max FPS (capability bits or offsets differ on 8k), power saving and deep sleep, key card |
| **Fourth family** (XM1r / OP1 / OP1 RGB) | Device info only | Everything else (protocol unimplemented, model recognition only) |
| **XM2we / OP1we** | Four dedicated cards (info / CPI & polling / key matrix / EEPROM backup) | All 4k-family cards |
| **Not connected** | Acknowledgements and notes only | All device cards |

**Design principle**: **only show fields confirmed by real-hardware testing** (实测确认). Fields whose offsets have not been located do not appear, rather than shipping a control that "does nothing" when changed — that is exactly how XM1's independent XY went wrong (the control was built first, then real-hardware testing revealed the firmware reads X only).

**Preview any model's UI** (no need to own the device): add a hash to the URL, e.g. `index.html#layout=xm1`, `#layout=v1`, `#layout=v2`, `#layout=8k`, `#layout=ro`, `#layout=we`, `#layout=unsupported`. Preview **only changes what is displayed and grants no read or write capability** — the write gate only cares whether a device is actually connected.

Adding `&simulate=lost` lets you rehearse the **"device lost → reset to the initial screen"** path, e.g. `index.html#layout=v2&simulate=lost` (touches no device either; intended for preview and regression testing when no hardware is available).

> **The full product catalog with version cross-references** is in **[`docs/official-product-catalog.md`](docs/official-product-catalog.md)** (compiled 2026-10-08 from the official download index and product pages: firmware/tool versions for 16 mice, official CDN download URLs, and the mapping to official GitHub repositories). The 2020-generation products (XM1/XM1r/XM2we/OP1we) have **no official GitHub repository**.
>
> **The 8k wired family is proven isomorphic to the 4k family**: static analysis of the XM2 8k tool v1.12 downloaded from the official CDN shows the same report ID `0xA1` in the first byte, the same 7 `HidD_*` APIs, and the PDB token `K26_046_config_v1.12_8k_motion_jjitter`. Supporting them therefore requires **no new protocol code** — just adding the VID/PID to the `MOUSE_PIDS` table.
>
> The four 4k wireless models share dongle PID `0x1970`, so they cannot be distinguished at the USB level; this tool uses the mouse's own PID returned by cmd `0x0E` to discriminate, and handles the v1/v2-incompatible field encodings (LOD, polling-rate enum, flag bits) separately. Variant PIDs `0x1969`/`0x1981` come from the device table in the official v1.02 tool binary (see `re/PROTOCOL_NOTES.md`). The XM2we family is identified by the dual criteria of PID `0x1960`/`0x1961` and interface page `0xFF02`.

## Features

- **Sensor**: CPI 4 slots (**independent XY — verified on real hardware**, 10–30000), slot count, current slot (v2), LOD (including glass-mode encoding conversion), angle snap, angle tuning (v2), ripple control, lift-off LED
- **Performance**: polling 4000/2000/1000/125 Hz, Motion Sync, Slamclick filter, jitter filter (v1), multi-click filter / forced max FPS (v2)
- **Power**: power-save timeout, deep sleep (1–120 minutes or off)
- **Buttons**: mapping table and click-filter display; filter values are editable and writable; GX Safe/Speed modes (left/right buttons)
- **Tools**: config export/import (JSON + raw 1024B blob), re-pairing, restore default pairing (0x71), read pairing data (0x72), factory reset (double confirmation), hex-level communication log
- **Connection robustness — the UI returns to the initial screen by itself once the device is gone**: two independent signals — ① the browser's `disconnect` event on the device (unplug/power loss, immediate); ② periodic enumeration via `navigator.hid.getDevices()` (two consecutive misses before declaring it gone, tolerating permission jitter; if the interface has already been closed by the browser, one miss suffices). On a hit, all residual state is cleared and the UI resets to the disconnected state, avoiding the illusion of "the UI says connected but writes are bound to fail".
  **Deliberately not using "send a probe command" to detect presence**: `0x0F` is a wireless wake command, and sending it on a timer prevents the mouse from ever deep-sleeping (wasted power); whereas `0x0E`/`0x07` return unreachable while the mouse sleeps, which would mistake "asleep" for "unplugged". "Wireless link down" (`inputreport 0xB1`) means the receiver is still there and the mouse is merely sleeping, and does **not** trigger a reset
- **XM2we family**: CPI 8 slots (slot 1 takes effect immediately), polling rate (125/250/500/1000 Hz one-hot mask), click debounce, key matrix (type 0x01 decoded + the rest shown as-is), EEPROM export (.txt / .json); every write is verified by read-back
- **i18n**: 8 languages — 简体中文 / 繁體中文 / English / Deutsch / Français / Español / 日本語 / 한국어. **The browser's language is auto-detected on first open** (`navigator.languages` matched in order; Traditional Chinese is detected first via `zh-TW`/`zh-HK`/`zh-Hant` so it is not swallowed into Simplified; falls back to Simplified Chinese), after which a manual pick from the top-right takes priority and is stored in localStorage; Japanese/Korean/Traditional automatically switch the CJK font stack (`html:lang()`) so Han characters don't pick up Simplified glyph forms. Entries live per-language under `src/i18n/`, and key-name consistency is validated by `npm run check:i18n`

## Running locally / deploying to GitHub Pages

The source is in two parts; the build script bundles both into a single file written to `dist/index.html` and to `index.html` at the repo root — both are zero-dependency single files that **work by double-clicking, no server required**.

| Directory | Contents |
|---|---|
| `src/` | TypeScript. Strictly layered (bottom → top): `state` / `transport` / `protocol` → `blob` / `verify` → `device-4k` / `device-8k` / `device-xm1` → `render` / `presence` → `session` → `connect` → `main` (the entry point only does assembly and event binding); `xm2we.ts` + `xm2we-ui.ts` are a fully independent second protocol family; `i18n.ts` + `i18n/*.ts` hold the 8 languages' entries |
| `scss/` | **The single source of styles** (`_tokens.scss` design tokens / `_mixins.scss` mixins / `main.scss` components) |

Tech stack: **TypeScript 7** (the Go-native compiler, `tsc --noEmit` for type checking) + **esbuild** for bundling + **sass** for SCSS compilation. Type checking and bundling are separated — `tsc` only checks types; the artifact is produced by esbuild.

**Locally**: open `index.html` by double-clicking (`file://` is a secure context, so WebHID works). If browser policy blocks it, any static server will do:

```bash
python -m http.server 8080
# then visit http://localhost:8080
```

**Building from source** (run after changing `src/` or `scss/`; the artifact is synced to `index.html` at the root):

```bash
npm install
npm run build     # esbuild bundles TS + sass compiles SCSS -> dist/index.html + index.html
npm run build -- --minify   # minified
npm run check     # tsc --noEmit type check
```

### Style development conventions (mandatory)

- **All styles are written in SCSS under `scss/`**, compiled by `build.mjs` via `sass.compile()` and inlined into the HTML.
- `index.template.html` keeps only the placeholders `/*__STYLES__*/` (and `/*__BUNDLE__*/` for JS). **Do not write `<style>` directly in the template.**
- To change theme colors / spacing / radii / font sizes → edit `_tokens.scss` only; component styles live in `main.scss` organized with nesting + `@each`.
- The build errors out if a placeholder is missing (preventing the template from drifting out of sync with the build).
- The distributed artifact remains **a single HTML file** with zero runtime dependencies; SCSS is only the source format during development.

**GitHub Pages**:

```bash
git init && git add . && git commit -m "feat: Endgame Gear web configurator"
gh repo create Endgame_Gear_Web_Configurator --public --source=. --push
gh api repos/{owner}/{owner}/pages -X POST -f "source[branch]=main" -f "source[path]=/"   # or pick main / in Settings → Pages
```

Then visit `https://<your-username>.github.io/Endgame_Gear_Web_Configurator/`. GitHub Pages is HTTPS by default, which satisfies WebHID's secure-context requirement.

> **Deployment notes** (each item verified for this project; the original feasibility analysis lives in git history — `docs/ui-port-feasibility.md`, removed 2026-10-11):
>
> - The artifact contains **no absolute paths** (and no `<base>`), so placing it under a project-page subpath `…/Endgame_Gear_Web_Configurator/` does not break. For comparison: a similar site, `op1w.vercel.app`, uses `/assets/…` absolute paths, so the same build moved to a project-page subpath would 404.
> - The repo root already has **`.nojekyll`**: branch publishing runs Jekyll by default, and Jekyll excludes files starting with `_` (such as `scss/_tokens.scss`) — worse, **if the Jekyll build fails, the whole site 404s**. This project only needs two built HTML files hosted.
> - Pages serves static assets with `Cache-Control: max-age=600` — after a push the old version may linger for 10 minutes; use a hard refresh when verifying.
> - Publishing from the repo root hosts **the entire repository** in public. It is confirmed that no vendor binaries are committed (`.gitignore` covers `*.exe` and real-hardware blobs); if you only want the artifact public, create a separate `gh-pages` branch holding just `index.html` and `tools/blob-studio.html`.

## Troubleshooting

| Symptom | Cause and handling |
|---|---|
| `blob read failed` / `0xA0 not ready (status=0x…)` | Bulk reports are slow, so a stale cache was read. Since v1.1 the 0x12 read is automatically resent and retried 4 times; if it still fails, open the communication log and send the hex to the developer |
| Read fails after the mouse sleeps | Hardware behaviour. Move the mouse and click "Re-read"; the software automatically sends a 0x0F probe to restore the channel |
| Receiver firmware shows `—` when wired | Normal; a wired connection has no dongle, and cmd 0x0D returns "not applicable" (0x07) |
| v1 current slot can't be changed | v1 hardware ignores software switching; use the CPI button on the mouse underside |
| Wired polling rate shows 1000 Hz | USB full-speed frame limit, a hardware ceiling; the stored value written is unaffected and recovers automatically on returning to wireless |
| Returns to the initial screen by itself with "device disconnected" | The device is not present (unplugged / powered off / receiver removed). The reset is **deliberate**: residual stale data after a disconnect makes writes look successful. Click "Connect device" again; the basis is the `disconnect` event plus device enumeration and does not depend on any write |
| Switching to another tab and back shows disconnected | Switching to the background **releases the WebHID interface** per security policy (so the interface isn't monopolized long-term); since the interface is released, the UI resets in sync rather than keeping unusable stale data. Just reconnect (released only once per page) |

## Protocol quick reference (see the vole repository's re/PROTOCOL.md and this project's re/PROTOCOL_NOTES.md)

- Channels: feature report `0xA1` (64B command/response, payload starts at offset 16), `0xA0` (1041B, carries the 1024B config blob)
- Commands: `0x0F` probe · `0x0D`/`0x0E` firmware info · `0xB4` battery · `0x12` read blob · `0x13` factory default · `0x14` sensor block · `0x15` performance block (declares 10 bytes, actually sends 11) · `0x16` key block ×2 · `0x70` pairing · `0x71` default pairing · `0x72` pairing data
- A write is persistent; status codes `0x01` OK / `0x03` busy (retry) / `0x07` not applicable to this connection / `0x08`,`0x11` mouse asleep
- After a failure you must resend the `0x0F` probe, otherwise the device stays "wedged" until the next probe succeeds

## Protocol family comparison (Endgame Gear is not one protocol)

| | **XM1** (2020 wired, VID `0x22D4`) | **XM2we** (2020 wired/2.4G) | **4k family** (4k wireless + 8k wired) |
|---|---|---|---|
| usage page | to be confirmed | `0xFF02` | `0xFF01` |
| report ID | `0xA1` out / `0xA0` in | `0x08` out / `0x09` in | `0xA1` out / `0xA0` in |
| frame structure | 64 B command / **1041 B bulk report** | 17 B + `(0x55−Σ)&0xFF` checksum | 64 B command / 1041 B read |
| config blob | **1024 B @ report offset 16** | none (goes to EEPROM) | 1024 B @ 16 |
| status byte | **none** (see HidD return codes) | none | `[1]`/`[2]` (v2 has an echo variant) |
| command count | **4** (`0x03`/`0x04`/`0x07`/`0x08`) | 5 opcodes | 13 |
| CPI slots | **3** | 8 slots | 4 |
| PC-side slot backup | `.profile` / `pfList.dat` (up to 5 slots) | — | JSON / raw blob |
| vendor DLL | none (protocol is in the main exe) | `OemDrv.exe` | `hidapi` statically linked |
| internal codename | K25A / K25B | — | W25 (4k wireless) / **K26** (8k wired) |

**XM1 and the 4k family share one protocol framework** — the `0xA0` 1041B bulk report, the 1024B blob @16, and the retry logic below are byte-for-byte identical. The differences are only VID, command-set size, presence of a status byte, and CPI slot count.
**So supporting XM1 and the 8k wired family requires almost no new protocol code.**

Shared HID communication wrapper: when `HidD_SetFeature` fails, error codes `{0x15, 0x17, 0x1D, 0x57, 0x65B}` are retried 4 times at 50 ms intervals — byte-for-byte identical in the official 4k tool and the XM1 main program. See `re/PROTOCOL_NOTES.md` and `re/XM1_NOTES.md`.

## Reverse-engineering verification

The protocol implementation has been verified byte-for-byte against the official `Endgame Gear XM2w 4k v2 Configuration Tool v1.02` binary: command table / targets / lengths, the 0x16 dual-block write, blob layout (CPI slots `0x23+5n`, keys `0x37+7n`, glass mode `0x6F`), and the busy-retry and send-error retry strategies all match. The complete evidence chain (disassembly scripts + intermediate artifacts) is under `re/`. The LED tab and Surface Calibration have no protocol implementation path in the official v1.02 (template leftover UI), so they are not implemented.

**XM1**: the official installer is an InstallShield Basic MSI (5.82 MB `ISSetupStream` proprietary compressed overlay; zlib/deflate/LZMA/BZ2 all fail to open it), so the real files were extracted with `pawstas80/Unpacker` before static analysis — 3 commands, no status byte, config stored in files rather than EEPROM. The full evidence chain is in `re/XM1_NOTES.md`.

## Acknowledgements

- **[johanneszab/vole](https://github.com/johanneszab/vole)** — the complete USB configuration protocol reverse-engineering documentation and Linux implementation (Ghidra + USBPcap + real-hardware verification); the sole basis for the 4k family's protocol layer
- **[okms/xm2we-linux](https://github.com/okms/xm2we-linux)** — complete protocol documentation for the XM2we 2020 wired/2.4G family (PROTOCOL.md, cross-verified on real hardware) and a Python implementation; the entire basis for XM2we support
- **[stuffz/mouse-battery-monitor](https://github.com/stuffz/mouse-battery-monitor)** — HID protocol documentation for battery status
- **[gentoocat/XM2we-Unleashed](https://github.com/gentoocat/XM2we-Unleashed)** — direct-communication exploration of XM2we (no license, used as intelligence reference only)
- **[qsxcv/UnofficialEGGWebConfig](https://github.com/qsxcv/UnofficialEGGWebConfig)** · **[zexsso/OP1-WebAPP](https://github.com/zexsso/OP1-WebAPP)** — comparable WebHID web configurators (8k series / OP1w 4k); for XM2w 4k v1/v2 these are currently the only ones (ecosystem overview in `docs/ecosystem-survey.md`)
- **[daviddwk/xm2we-util](https://github.com/daviddwk/xm2we-util)** — a second independent implementation of the XM2we protocol, used to cross-check constants
- **[Endgame Gear / Pro Gamersware GmbH](https://www.endgamegear.com/)** — the hardware itself, plus unobfuscated, analyzable official configuration tools

## Disclaimer

This is an independent open-source tool with no affiliation to Endgame Gear / Pro Gamersware GmbH. It only reads and writes your own configuration; it does not modify firmware and does not bypass any protection mechanism. Use at your own risk; you bear the consequences of any configuration change you make (the protocol documentation has verified that writing works in both directions, but please use low-level operations other than "factory reset" judiciously).

**Models not verified on real hardware (the entire 8k wired family, XM2we / OP1we, and several variant PIDs) are read-only by default**: clicking write shows a confirmation dialog, and after confirming it is allowed **for that connection only**, with a backup exported automatically first. Per-model rationale and residual risk: **[docs/release-safety-audit.md](docs/release-safety-audit.md)**.

## Contributing to testing

Do you have a mouse we don't (the entire 8k wired family, XM2we / OP1we)? Your real-hardware testing is the only path to verifying these models. Please read these two documents first:

- **[docs/remote-beta-guide.md](docs/remote-beta-guide.md)** — must read before participating (backup, risks, how to recover)
- **[docs/test-checklist.md](docs/test-checklist.md)** — which items to test and how to fill each in

Clicking "Export test data packet (.json)" in the tool gives you all of it in one go: model / VID / PID / interface set / firmware / full blob (EEPROM dump for the WE family) / communication log, plus a report template.

## License

This project is released under **GPL-3.0-or-later** (see `LICENSE`). You are free to use, modify and redistribute it, and any derivative distribution based on this code must also be open-sourced under GPL-3.

Third-party material: `op1web_PROTOCOL.md` (MIT © zexsso) and `eggweb_protocol.js` (**AGPL-3** © qsxcv) collected under `re/upstream/` are retained as research archive only and take no part in the build; `MANIFEST.md` holds the compliance conclusions, and the full community scan lives in git history (`docs/community-code-scan.md`, removed 2026-10-11). Protocol facts themselves are not copyrightable, but please respect each upstream project's license terms.

## Changelog

See **[CHANGELOG.md](CHANGELOG.md)** (since v1.3).

## Roadmap

The task queue with dependencies and completion status lives in **[TASKS.md](TASKS.md)**.

### Support status

| Device | Status |
|---|---|
| **XM2w 4k / 4k v2, OP1w 4k / 4k v2** | ✅ Full read + write (protocol verified byte-for-byte against the official v1.02 tool) |
| **XM1 / XM1 RGB** | ✅ Read + write available (writes hard-limited to the 23 bytes confirmed by real-hardware testing) |
| **XM2we / OP1we** | 🧩 Code ready (`src/xm2we.ts`, 29 offline simulation assertions pass), **never connected to real hardware** |
| **XM2 8k / OP1 8k (incl. v2)** | 🔍 PIDs recovered from official tool binaries, **read-only** — writes will only open once the gen encoding is confirmed on real hardware |

### Done

- [x] Official repo and product-line reconnaissance (9 repos, full table of 16 mice → `docs/official-product-catalog.md`)
- [x] All fields for the 4k wireless family v1 / v2 (the current primary support target)
- [x] XM2we 2020 wired/2.4G family (29 offline simulation assertions pass)
- [x] XM1 2020 wired family: **read + restricted write** (chapter 6 of `re/XM1_NOTES.md`)
- [x] Style layer migrated to SCSS (`scss/`; mandatory conventions in the "Running locally" section)
- [x] Dark theme (`[data-theme]` + CSS custom properties, zero component-style changes)
- [x] Offline blob analysis tool (`tools/blob-studio.html`, with parsing and dual-snapshot diffing)

### Todo (by priority)

1. **Real-hardware verification of the 8k wired family** — PIDs filled in (`0x1966`/`0x1964`/`0x1980`/`0x1978`); needs gen encoding and field semantics confirmed before writes open
2. **XM2we real-hardware verification** — input report bridge timing, polling-rate writes
3. **Button remapping UI** — the 4k family's protocol layer is implemented, the editor is missing
4. **XM1 lighting / key mapping / Angle Snap / Smoothing** — doable once located by differential analysis
5. **More languages** — add an entry file under `src/i18n/` (following the 189 keys in `de.ts`), import it into `I18N` in `src/i18n.ts`, add the language tag mapping in `normalizeLang()`, then add one entry each to the language dropdown in `index.template.html` and to `STAGE_COLORS`/`BTN_NAMES` in `main.ts`. `npm run check:i18n` validates each site individually — PRs welcome
6. **Deploy to GitHub Pages + request protocol documentation from the vendor** (draft email in git history — `docs/email-to-endgamegear.md`, removed 2026-10-11)

> ✅ Done (2026-10-09): post-write read-back verification for the 4k family; **independent XY CPI confirmed on real hardware**

Detailed tasks, dependencies and completion status: **[TASKS.md](TASKS.md)**.
