# Endgame Gear OP1w 4k — HID configuration protocol

> **Two generations, two protocols.** Part I documents the older
> `22D4:1503` hardware driven by the embedded DLL. Current hardware enumerates as
> **`3367:1970`** and speaks a different command set implemented inside the exe —
> see **Part II** at the bottom. If you only care about a mouse you own today,
> read Part II.

# Part I — gen 1 (VID `22D4` / PID `1503`)

Reverse-engineered from `makalu_67_dll.dll`, which the configuration tool
`Endgame_Gear_OP1w_4k_Configuration_Tool_v1.04.exe` carries **embedded in its
`.rsrc` section** (file offset `0x17E31C`, 90112 bytes) and drops/loads at runtime.
The `.exe` itself is only an MFC GUI shell; all device I/O lives in the DLL.

Analysis: IDA + Hex-Rays. DLL image base `0x10000000`.

---

## 1. Device identity

| | |
|---|---|
| USB VID | `0x22D4` (8916) |
| USB PID | `0x1503` (5379) |
| Config interface | **UsagePage `0xFF01`, Usage `0x02`** |
| Bootloader / "x2 compliant" interface | UsagePage `0xFF02`, Usage `0x01` |

`sub_10001DD0(pid)` enumerates HID interfaces via SetupAPI, opens each, and keeps
the one whose `HIDD_ATTRIBUTES` match VID/PID **and** whose `HIDP_CAPS` are
`UsagePage == 0xFF01 && Usage == 2`. The event-listener channel (`Capture_cb_data`)
opens the same VID/PID through hidapi's `hid_open(8916, 5379, NULL)`.

WebHID filter:

```js
navigator.hid.requestDevice({
  filters: [{ vendorId: 0x22d4, productId: 0x1503, usagePage: 0xff01, usage: 0x02 }],
})
```

---

## 2. Transport

Everything is **HID Feature reports** — `HidD_SetFeature` to write, `HidD_GetFeature`
to read. There are exactly two report IDs:

| Report ID | Total buffer incl. report-ID byte | WebHID payload length |
|---|---|---|
| `0xA1` | 64 (`0x40`) | 63 |
| `0xA0` | 1041 (`0x411`) | 1040 |

> All byte offsets below are **absolute in the raw buffer, i.e. offset 0 is the
> report-ID byte.** WebHID hands you the payload with that byte stripped, so
> subtract 1 when indexing a WebHID `DataView`.

### 2.1 Short frame (`0xA1`)

```
 off  0   1    2    3   4   5        6      7 .. 15   16 .. 63
     A1  op  sub   00  00  profile  value   00        payload / response
```

* `op` — command class
* `sub` — sub-command
* `profile` — 1..3 (some profile ops accept 1..6)
* `value` — scalar argument
* Response data starts at offset **16**

### 2.2 Long frame (`0xA0`)

```
 off  0   1    2    3   4   5        6   7..8      9..15   16 .. 1039
     A0  op  sub   00  00  profile  00  checksum   00      1024-byte payload
```

Checksum (only used by the button-block writer `0x21`) is a plain 16-bit sum of
payload bytes 16..1039, little-endian at offset 7:

```c
u16 sum = 0;
for (int i = 16; i < 1040; i++) sum += buf[i];
```

### 2.3 Handshake

Every write is:

1. `SetFeature(frame)` — on `ERROR_NOT_READY(21) / 23 / 29 / 87 / 1627`, retry up
   to 3× with 50 ms gaps.
2. `Sleep(30..100 ms)` (per-command, see table)
3. `GetFeature` a zeroed buffer whose byte 0 is the report ID (`0xA1` or `0xA0`)
4. Inspect `resp[1]`:
   * `1` → success
   * `3` or `4` → device busy; re-read after 0 / 30 / 60 ms
   * anything else → failure

Return codes used by the DLL: `1` = OK, `2` = bad argument, `20` = I/O failure,
`255` = device not found, `5` = listener started.

---

## 3. Command table

`cmd` column is the little-endian DWORD the DLL stores at buffer offset 0, i.e.
`A1 | op<<8 | sub<<16`.

| cmd DWORD | op | sub | Export | Args | Sleep | Response |
|---|---|---|---|---|---|---|
| `0x0002A1` | 02 | 00 | `Get_fw_version` | — | 50 | u16 LE at `[16..17]`, rendered as hex digits then read back as decimal |
| `0x000AA1` | 0A | 00 | `Set_button_settings` header | profile, 8-byte header | 50 | ack |
| `0x020BA1` | 0B | 02 | `Sync_profile` | profile 1..6 | 50 | ack |
| `0x030BA1` | 0B | 03 | `Get_current_profile_id` | — | 50 | id at `[16]` |
| `0x040BA1` | 0B | 04 | `Set_current_profile_id` | profile | 100 | ack |
| `0x050BA1` | 0B | 05 | `Add_profile` | profile | 50 | ack |
| `0x070BA1` | 0B | 07 | `Read_profile_data` | profile | 80 | **`0xA0` read**, 1024-byte blob at `[16..1039]` |
| `0x090BA1` | 0B | 09 | `Get_number_of_profiles_in_mouse` | — | 60 | count at `[16]`, valid 1..5 |
| `0x000CA1` | 0C | 00 | `Update_lighting_settings` | profile, 48-byte lighting struct at `[16]` | 100 | ack |
| `0x0A0CA1` | 0C | 0A | `Set_led_on` | — | 100 | ack |
| `0x0B0CA1` | 0C | 0B | `Set_led_off` | — | 100 | ack |
| `0x010DA1` | 0D | 01 | `Set_polling_rate` | profile, code | 50 | ack |
| `0x020DA1` | 0D | 02 | `Set_button_response_time` | profile, ms (0..16, **even only**) | 50 | ack |
| `0x030DA1` | 0D | 03 | `Set_angle_snapping` | profile, 0/1 | 30 | ack |
| `0x040DA1` | 0D | 04 | `Set_lod` | profile, 0/1 (1 mm / 2 mm) | 50 | ack |
| `0x000EA1` | 0E | 00 | `Reset_factory_default` | — | 50 | ack |
| `0x1F0DA0` | 0D | 1F | `Set_performance_settings` | profile + 1024-byte blob | 50 | ack |
| `0x1F0AA0` | 0A | 1F | `Set_all_button_settings` | profile + 1024-byte blob | 50 | ack |
| `0x0021A0` | 21 | blk | button/macro block write | profile, block idx, checksum, 1024 B | 100 | ack |

Legacy polling-rate encoding in `Set_polling_rate` / `Set_performance_settings`:

| Requested Hz | wire code |
|---|---|
| 125 | `8` |
| 250 | `4` |
| 500 | `2` |
| anything > 500 | `1` |

The v1.04 GUI only offers **1000 / 2000 / 4000 Hz** (resource strings at
`0x5BD0B8`), and all three fall into the `> 500 → 1` branch, so the high rates are
not distinguishable through this DLL entry point — read `blob[5]` back from the
device to learn the real encoding for 2k/4k.

`Set_dpi_settings` (ordinal 30) is a **dead stub** — it compiles to `return 20;`.
DPI is written through `Set_performance_settings`.

---

## 4. Profile blob layout (1024 bytes)

Recovered from `sub_10007840` (wire → host struct) and `sub_100035F0` (defaults).
Offsets are within the 1024-byte payload, i.e. buffer offset 16 + N.

| Offset | Size | Field |
|---|---|---|
| `0` | 1 | Profile id (1..3) |
| `5` | 1 | Polling-rate code |
| `15,16,17` | 3 | DPI stage 1 colour R,G,B |
| `20,21,22` | 3 | DPI stage 2 colour |
| `25,26,27` | 3 | DPI stage 3 colour |
| `30` | 1 | DPI stage count / active-stage pair (host `+17`) |
| `31` | 1 | (host `+16`) |
| `36..37` | 2 LE | DPI stage 1 X |
| `38..39` | 2 LE | DPI stage 1 Y |
| `41..42` | 2 LE | DPI stage 2 X |
| `43..44` | 2 LE | DPI stage 2 Y |
| `46..47` | 2 LE | DPI stage 3 X |
| `48..49` | 2 LE | DPI stage 3 Y |
| `50` | 1 | Angle snapping (0/1) |
| `55 + 7*i` | 7 | Button record `i`, i = 0..8 |
| `131` | 1 | Lighting effect (wire code) |
| `132..170` | 39 | 13 × RGB zone colours |
| `176` | 1 | Brightness (default 100) |
| `178,179,180` | 3 | Speed / direction / mode |
| `201..203` | 3 | DPI stage 4 colour |
| `206..208` | 3 | DPI stage 5 colour |
| `211..213` | 3 | DPI stage 6 colour |
| `241..242` | 2 LE | DPI stage 4 X |
| `243..244` | 2 LE | DPI stage 4 Y |
| `246..247` | 2 LE | DPI stage 5 X |
| `248..249` | 2 LE | DPI stage 5 Y |
| `251..252` | 2 LE | DPI stage 6 X |
| `253..254` | 2 LE | DPI stage 6 Y |
| `300 + 7*i` | 7 | Button record `9+i`, i = 0..8 |

Button record (7 bytes): `[0]` action type, `[4..5]` u16 parameter, rest padding.
18 records total.

Defaults from `sub_100035F0`: polling 1000 Hz, debounce 10 ms, DPI stages
800 / 800 / 1600 / 3200 / 5000 / 10000, lighting effect `16`, brightness 100.

### Lighting effect code mapping

`sub_100038B0` (host → wire) and `sub_10007840` (wire → host):

| host | wire |
|---|---|
| 0 | 0 |
| 1 | 16 |
| 2 | 21 |
| 4 | 6 |
| 5 | 4 |
| 7 | 17 |
| 9 | 2 |
| 15 | 15 |
| 19 | 19 |
| other | 1 |

The GUI exposes one named effect, `"Singel color"` *(sic)*, plus `OFF`.

### Lighting struct (48 bytes, written at buffer offset 16 by op `0x0C`/`00`)

| Offset | Field |
|---|---|
| `0` | Effect (wire code, dword) |
| `4..42` | 13 × RGB |
| `43` | mode flag |
| `44` | brightness |
| `46` | speed |
| `47` | direction |

Effect `16` clamps `[47]` to ≤ 7; effect `19` clamps it to ≤ 2; `0` becomes `1`.

---

## 5. Event / notification channel

`Capture_cb_data(callback)` opens the device with hidapi and spawns a thread
(`StartAddress`) that does `hid_read_timeout(dev, buf, 9, ...)` in a loop with
80 ms pacing. Input reports are 9 bytes:

```
 [0] report id   [1] event type   [2] value
```

| Event type | Handling |
|---|---|
| `1` | value at `[2]`, callback, continue immediately |
| `2` | value at `[2]`, callback |
| `3` | value taken from previous frame's `[2]` |
| `4`, `5`, `6` | value at `[2]` |
| `0x23`, `0x24` | value at `[2]`, separate slot — battery / charge state |

The callback receives `(u8* eventType, u8* value)`.

---

## 6. Other GUI option strings (from `.rsrc`)

```
LOD:          1mm | 2mm
Polling:      1000Hz | 2000Hz | 4000Hz
Motion sync:  OFF | GX Speed Mode | GX Safe Mode
Power mode:   Corded Gaming Mode | High Performance Mode | Low Power Mode
Lighting:     Singel color
Profiles:     1 | 2 | 3 | 4
```

Build fingerprint from the exe's stripped PDB path:
`H:\Project\W26\Config\W25_094_config_V0.90_cpi_roop__v1.04\Release\Endgame Gear OP1w 4k Configuration Tool.pdb`

---

# Part II — gen 2 (VID `3367` / PID `1970`)

Everything above describes the protocol implemented by `makalu_67_dll.dll`, which
only ever looks for VID `0x22D4` / PID `0x1503`. Current hardware enumerates as
**`3367:1970`, product string "Endgame Gear HS Dongle"**, and the DLL contains no
reference to either ID (verified by byte-scanning both binaries).

The configuration tool drives that hardware from code compiled directly into the
**exe**, not from the DLL:

| Address | Role |
|---|---|
| `sub_403540` | `open(vid, pid)` — same SetupAPI walk, same `FF01:02` selection |
| `sub_403760` | SetFeature, 64-byte buffer, 3 retries at 50 ms |
| `sub_403830` | GetFeature, re-reads on status 3 with a +200 ms backoff |
| `sub_4041D0` | 1 KB blob → host struct |
| `sub_404CA0` | host struct → 28-byte basic payload |
| `sub_4049C0` | host struct → 56-byte button payload |
| `sub_416180` | APPLY handler |

## Transport

Same two feature reports (`0xA1`, `0xA0`), but on this hardware the report
descriptor declares **both as 1040-byte payloads**. The exe still submits 64-byte
buffers for `0xA1`; Chrome zero-pads, which works.

WebHID specifics, established empirically against the device:

* `receiveFeatureReport()` returns the frame **without** a report-ID byte
* the device's own first byte is an `0xA1` echo, so **index 0 = echo,
  index 1 = status, index 16 = payload** — identical to the disassembly's
  indexing. Re-attaching a report ID shifts everything by one.
* the device holds a **single response buffer**. Reading `0xA0` right after a
  command that produced an `0xA1` answer hands back that stale answer, so every
  read must re-issue its own request.
* the status byte doubles as a state code: `1` ok, `3` busy, `8` cached,
  `0x11` wireless. Validate the payload rather than demanding `1`.

## Command set

Opcode at `buf[1]`. Write commands carry a `0x0F` marker at `buf[2]` and the
payload length at `buf[3]`, payload from `buf[16]`.

| Frame | Meaning |
|---|---|
| `A1 0D` | 14-byte info block at `[16]` |
| `A1 0E` | 14-byte info block at `[16]` |
| `A1 0F 01` / `A1 0F 0F` | wake / keep-alive (wired path) |
| `A1 12` | request settings blob → then read report `0xA0`, 1024 B at `[16]` |
| `A1 13` | commit |
| `A1 14 0F 1C` | write 28-byte basic settings |
| `A1 15 0F 0A` | write 10-byte advanced settings |
| `A1 16 0F 1C` | write 28-byte button block; `buf[6]` = block 1 or 2 |
| `A1 70` / `A1 71` | pairing handshake (gated on holding LMB+RMB+MMB 3 s) |
| `A1 72` | 4 dwords of device info at `[16..31]` |
| `A1 B4` | single byte at `[16]` |

`sub_416180` computes a dirty mask (bit 0 basic, bit 1 advanced, bit 2 buttons)
and branches on the connection mode byte at `byte_57CCD8`:

| Mode byte | Link | Write settle | Factory-reset settle | Wake first |
|---|---|---|---|---|
| `0x11` (17) | **wired** | 500 ms | 800 ms | no |
| `0x22` (34) | **wireless** | 880 ms | 1080 ms | yes |

Which value is which is easy to get backwards. It is pinned by `sub_411260`,
which forces the polling combo to index 0 *and disables it* when the byte is 17 —
and on real hardware the rate is locked to 1000 Hz while plugged in by cable. The
longer settle plus mandatory wake landing on 34 corroborates it: those are radio
concerns.

**2000 / 4000 Hz are dongle-only.** The wired link offers 1000 Hz only.

## Settings blob

**Confirmed against live hardware.** A device whose GUI showed CPI
1600/1600, 800/800, 1600/1600, 3200/3200 produced exactly those bytes.

CPI record — 5 bytes, `[flag u8][X u16 LE][Y u16 LE]` — four stages at blob
offsets **35, 40, 45, 50**.

Button record — 7 bytes — eight records at blob offsets
**62, 69, 76, 83, 90, 97, 104** and **15**.

Basic flag bytes occupy **blob[7..14]**.

## Deriving the write payloads

`sub_4041D0` maps blob → host struct; `sub_404CA0` maps host struct → wire. They
compose once you notice **`sub_404CA0`'s pointer sits 8 bytes into the parser's
struct**: the indices it skips (5, 9, 15, 21, 27) land exactly on the parser's
unused slots (17, 23, 29, 35).

Under that alignment the 28-byte basic payload resolves to these blob bytes:

```
wire[0..7]   = blob[7, 8, 9, 10, 11, —, 14, 13]      (— stays zero)
wire[8..27]  = blob[35..54]                          (the four CPI records)
```

The second line is the check: a wrong offset would not land the CPI block
contiguously at the tail of the payload.

The same composition gives the 56-byte button payload (sent as two 28-byte
blocks): the eight 7-byte records at blob `62, 69, 76, 83, 90, 97, 104, 15`.

## Settings blob — field map

All offsets are into the 1024-byte payload (buffer offset 16 + N). Field names
come from the vendor tool's tab populators; blob offsets from composing those
with `sub_4041D0`.

| Offset | Field | Source | Verified |
|---|---|---|---|
| `3` | Deep sleep: bit 7 set = disabled, low 7 bits = minutes | `sub_409FA0` | yes — flipped 1→2 when changed |
| `4` | Power saving: same encoding | `sub_409FA0` | yes — `0x81` = off, 1 min |
| `5` | Polling rate: `8`=1000 Hz, `4`=2000 Hz, `2`=4000 Hz | `sub_411260` | yes — read 8 on 1000 Hz |
| `6` | Filter bits: bit 0 slamclick, bit 4 motion jitter | `sub_411260` | yes — read 0, both off |
| `7`, `13` | carried by the 0x14 frame, unread by the Basic tab | — | — |
| `8` | Disable LED on lift-off, **inverted** (1 = unchecked) | `sub_40F9B0` + elimination | yes |
| `9` | LOD: `2` = 2 mm, else 1 mm | `sub_40F9B0` | yes — read 2 on "2mm" |
| `10` | Angle snapping | live diff | yes — flipped 0→1 when enabled |
| `11` | Ripple control | live diff | yes — flipped 0→1 when enabled |
| `12` | Motion sync | `sub_411260` | yes — read 0, unchecked |
| `14` | CPI level count, 1..4 | `sub_40F9B0` | yes |
| `15`–`34` | CPI indicator palette: 4 × `[R][G][B][enabled][id]` | — | yes — see below |
| `35`, `40`, `45`, `50` | CPI records: `[flag u8][X u16 LE][Y u16 LE]` | `sub_40F9B0` | yes — 1600/800/1600/3200 |
| `35` | doubles as the X/Y-split flag | `sub_40F9B0` | yes |
| `55`, `62`, `69`, `76`, `83`, `90`, `97`, `104` | Button records, 7 bytes each | `sub_4096F0` | yes |
| `61`, `68`, `75`, `82`, `89` | Multiclick filter / SPDT, 7th byte of records 1-5 | `sub_411260` | yes — F1/F1/8/8/8 |

Button record order: Left, Right, Middle, Back, Forward, CPI button, Wheel up,
Wheel down.

Although the payload is 1024 bytes, **only `blob[0..110]` is used** — every byte
past 110 reads zero on a live device, and 56 bytes are non-zero in a default
configuration.

Multiclick byte: `0xF1` = GX Speed Mode, `0xF0` = GX Safe Mode, otherwise a
debounce time in ms (slider clamped to 25, defaults to 8).

### Button action encoding (`sub_409270`)

Record byte 0 is the class, byte 1 the code.

| Class | Codes |
|---|---|
| `0` mouse button | `1` left, `2` right, `4` middle, `8` back, `16` forward |
| `1` wheel | `1` up, `0xFF` down |
| `2` keyboard | byte 1 = modifiers (1 Ctrl, 2 Shift, 4 Alt, 8 Win), byte 2 = key code |
| `9` | `0xF1` CPI loop |
| `12` | direct CPI: u16 X at byte 2, u16 Y at byte 4 |
| `24` | `0x96` browser, `0x94` explorer |
| `32` media | `0xB5` next, `0xB6` previous, `0xCD` play/pause, `0xE2` mute, `0xE9` vol up, `0xEA` vol down |
| `0xFF` | disabled |

Left-handed mode is detected by the *Right* record reading as left click
(`sub_4096F0` compares the record dword against `0x100`).

## Deriving the write payloads

`sub_4041D0` maps blob → host struct; `sub_404CA0` / `sub_4049C0` / `sub_404B50`
map host struct → wire. They compose, but **the three writers index the struct at
different offsets**:

* `sub_404CA0` (basic, 28 B) reads at **host + 8** — the indices it skips
  (5, 9, 15, 21, 27) land on the parser's unused slots (17, 23, 29, 35).
* `sub_4049C0` (buttons, 56 B) and `sub_404B50` (advanced, 10 B) read at
  **host + 0**.

Getting that wrong is easy and silent. The self-checks: under the correct
alignment the basic payload's last 20 bytes come out as `blob[35..54]` (exactly
the four CPI records), and the button payload comes out as `blob[55..110]`
(exactly the eight records).

Resulting wire → blob maps:

```
basic    (0x14, 28 B): 7, 8, 9, 10, 11, —, 14, 13, 35..54      (— stays zero)
advanced (0x15, 10 B): 12, 5, 6, 4, 61, 68, 75, 82, 89, 3
buttons  (0x16, 2x28): 55..110
```

## Wake — required before everything

`A1 0F 01` / `A1 0F 0F` wake the link. **Without one, the dongle answers every
command with status `8` and replays a single cached buffer.** That buffer keeps a
valid-looking CPI region while the header goes stale, so reads appear to succeed
and any field mapping "confirmed" against them is wrong. The tool calls
`sub_405420`, falling back to `sub_405540`, before every operation.

Observed status codes: `1` ok, `3` busy/computing, `8` stale (not awake),
`0x11` wireless mode echo.

### CPI indicator palette

`blob[15..34]` holds four 5-byte records, `[R][G][B][enabled][id]`. Defaults:

```
15: ff ff 00 01 01   yellow, id 1
20: 00 00 ff 01 02   blue,   id 2
25: ff 00 00 01 03   red,    id 3
30: 00 ff 00 01 04   green,  id 4
```

**Read-only in practice.** None of the three write payloads covers this range
(they carry `blob[3..14]`, `[35..54]` and `[55..110]`), and the vendor tool has
no colour picker — no `ChooseColor` import exists — it only paints the swatches.

The tool displays CPI 1-4 as **blue, green, yellow, red**, i.e. palette ids
**2, 4, 1, 3** — not storage order. That mapping is empirical: it matches the GUI
for all four stages, but no code was found that encodes it, and no hardcoded
COLORREF table exists in the binary either.

### Power settings

The Power Settings tab has **no command of its own** — it shares the `0x15`
Advanced frame, which is why searching for a dedicated write command finds
nothing. `sub_409FA0` reads each byte as a *signed* char: `>= 0` checks the box
and uses the value directly, `< 0` unchecks it and uses `byte & 0x7F`. So bit 7
means "disabled" and the low 7 bits are the idle timeout in minutes (GUI range
1..120).

The tab also disables one checkbox when both are enabled with equal timeouts.

### Pinning the checkbox bytes

`sub_40F9B0` gives three checkbox bytes but not which label each carries — on a
device with all of them off there is nothing to tell them apart. Toggling one
setting at a time in the vendor tool and re-reading the blob resolves it in one
step each, because a single byte moves:

```
all off        : 00 80 00 01 81 08 00 00 01 02 00 00 00 02 01 ff
+ angle snap   : 00 80 00 01 81 08 00 00 01 02 01 00 00 02 01 ff   -> blob[10]
+ ripple       : 00 80 00 01 81 08 00 00 01 02 01 01 00 02 01 ff   -> blob[11]
```

`blob[8]` is then the remaining checkbox, and its polarity is inverted: it reads
1 while "Disable LED on Lift-Off" is unchecked.

## Still unmapped

* `blob[3]`, `blob[4]`, `blob[7]`, `blob[13]` — carried by the write frames but
  never read by any tab populator.
* Keyboard-combo and direct-CPI button actions decode but are not assignable from
  the web UI.
