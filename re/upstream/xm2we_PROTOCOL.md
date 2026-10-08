# Endgame Gear XM2we — vendor HID protocol (reverse-engineered)

Derived from static analysis of `XM2we_Configuration_Software_Setup_v1.0.exe`
(Inno Setup → `app/OemDrv.exe`, MFC/PE32) and confirmed against real hardware.
No prior public Linux work existed.

## Device

| | |
|---|---|
| Receiver (2.4 GHz dongle) | USB `3367:1961` |
| Mouse in wired mode | USB `3367:1960` |
| Sensor / MCU | PixArt PAW3370 / CompX CX52850 |
| Battery | 410 mAh, **no fuel-gauge IC** → percent is a coarse voltage estimate |

The dongle exposes two HID interfaces. Commands live on interface 1, identified by the
collection with **usage page `0xFF02`, usage `0x02`, feature length `0x11` (17)** — feature
report ID `0x08`. The vendor app locates it exactly this way, so matching on that is more
robust than a `/dev/hidrawN` number.

## Framing

Command — `HIDIOCSFEATURE` / `HidD_SetFeature`, report `0x08`, 17 bytes:

    [0]=0x08  [1]=opcode  [2]=0  [3..4]=address BE16  [5]=data length  [6..]=data  [16]=checksum

Reply — arrives as **input report `0x09`** on the same hidraw node, same shape:

    [0]=0x09  [1]=opcode echo  [3..4]=address echo  [5]=data length  [6..]=data  [16]=checksum

**Checksum** (both directions): `(0x55 - sum(bytes[0..15])) & 0xFF`.
Equivalently, a reply is valid when `sum(all 17 bytes) & 0xFF == 0x55`.

Data must fit between `[6]` and the checksum at `[16]`, so **10 bytes per frame** is the ceiling.

## Opcodes

| Op | Direction | Meaning | Status |
|----|-----------|---------|--------|
| `0x02` | write | `TellDrvStatus` — announce the config driver | not exercised |
| `0x03` | read | link state. data `[1]` = up, `[0]` = mouse offline | verified |
| `0x04` | read | **battery**: data `[percent, charging]` | verified |
| `0x07` | write | **EEPROM write** | verified |
| `0x08` | read | **EEPROM read** | verified |
| `0x0F` | read | current profile (returns 1) | read-only, unconfirmed meaning |
| `0x10` | write | `SetCurProfile` | not exercised |

Names come from the vendor binary's own debug strings (`GetPower: nPower=0x%x, bCharging=0x%x`,
`WriteEEPROM( Addr=0x%x )`, `ReadROM Failed at %d: nAddr=0x%x`, `TellDrvStatus= %x`).

### Battery (`0x04`)

Both data bytes are confirmed on hardware: inserting a USB-C cable flips `data[1]` from `0` to
`1` while `data[0]` keeps reporting the percentage. The vendor app validates the percent with
`cmp $0x64; ja` (reject > 100) — that is what identifies the byte as a percentage.

The mouse stays on the 2.4 GHz link while charging (no `3367:1960` device enumerates), but the
link drops briefly at the moment of insertion, during which `0x03` reads `0` while `0x04` still
returns good data. **Read the battery before consulting the link, not after.**

### The mouse sleeps

EEPROM commands need a real round-trip to the mouse, which sleeps after roughly 4 seconds idle;
requests sent while it sleeps are simply not answered. `0x03`/`0x04` keep answering throughout,
so the receiver evidently caches those. Correlating reads against mouse activity gives a clean
split: every failure falls in an idle window, every read during or within ~4 s of movement
succeeds. Retry until it wakes, and do not read the config before an action that wakes it.

## EEPROM

The whole config is **`0x00`–`0xB4`**; everything above reads as erased `ff`, including the
`0x100+` region the vendor traces mention. Map from the binary's trace strings:

| Range | Contents |
|---|---|
| `0x00-0x0B` | header — **polling rate**, profile (6 value/complement pairs) |
| `0x0C-0x2B` | **CPI**, 8 records of `[x, y, mul, crc]` |
| `0x2C-0x4B` | CPI indicator colour, 8 records of `[r, g, b, crc]` |
| `0x4C-0x5F` | CPI LED effect (two zones) |
| `0x60-0x9F` | **KeyMatrix**, 16 records of `[type, code, param, crc]` |
| `0xA0-0xB4` | LOD, debounce (`0xA9`), report rate |

**Stored records reuse the same `0x55 - sum` checksum as the wire frames.** A CPI record checks
as `crc == (0x55 - x - y - mul) & 0xFF`; scalars elsewhere are stored as a value immediately
followed by its `0x55` complement. Beware: a validating checksum confirms the record
*boundaries* only. It says nothing about what the fields mean.

### Polling rate — header `0x00`

A one-hot mask, `rate = 1000 // mask`:

| mask | blinks | rate |
|---|---|---|
| `0x08` | 1 | 125 Hz |
| `0x04` | 2 | 250 Hz |
| `0x02` | 3 | 500 Hz |
| `0x01` | 4 | 1000 Hz |

Verified by measuring HID report timing (`probe/polling_rate.py`): the field read `0x04` while
reports arrived every 4.00 ms (250 Hz); one press of the mouse's button moved it to `0x02` and
reports became exactly 2.00 ms (500 Hz).

**The button on the mouse cycles polling rate — it does not change the CPI stage.** Its 1–4
blinks look exactly like a CPI stage indicator. Mistaking it for one invalidates every
"cycle the stages and measure CPI" experiment, because the CPI stage never moves.

### CPI — `0x0C`

`CPI = (x + 1) * 50`, or `* 100` when the record's multiplier bits are set, matching `DPIRANGE`
in `Cfg.ini` (50–10000 step 50, then 10100–19000 step 100). The `mul` byte is packed, not a flag:

    X_hw = ((M & 0x0C) << 6) | x      mulX = M & 0x03
    Y_hw = ((M & 0xC0) << 2) | y      mulY = (M >> 4) & 0x03

**Confirmed by measurement**: a slot storing `0x1f` predicts 1600 cpi; counting raw sensor counts
over a ruler-measured stroke gave 1580, a 1.2% error. Three things agree — it reproduces
`DPIRANGE`, the untouched slots on real hardware map exactly onto the vendor's factory defaults
(400/800/1600/3200 = `07`/`0f`/`1f`/`3f`), and the one slot the owner had edited decoded to the
value they said they set.

**Slot 1 (`0x0C`) is the CPI in use.** Writing it changes pointer speed immediately — no apply
step, no power cycle. There is no separate commit opcode: the vendor's own "Set DPI" routine is
its `WriteEEPROM` function and nothing more.

### Writing

`0x07`, same frame as the read plus a data field. Confirmed end to end: writing `07 07 00 47`
(400 cpi) to `0x0C` is acknowledged, reads back byte-identical, survives a power cycle, and
changes pointer speed at once. `probe/ee_write.py` refuses addresses outside `0x00-0xB4`, reads
the target first, and verifies by reading back.

### Key records — `0x60`

`type 0x01` is a mouse button, `code` a bitmask: `0x01` left, `0x02` right, `0x04` middle,
`0x08` back, `0x10` forward. Types `0x02`, `0x04`, `0x07`, `0x08` are **not decoded**.

## Unresolved

- **CPI stages 2–4.** The vendor UI has a "CPI Stages" count of 1–4. Where it is stored is
  unknown, and writing slots 2–4 showed no effect — but that was only ever tested while cycling
  the *polling rate* button, so the CPI stage was never actually changed. Untested, not disproven.
- **Setting polling rate from Linux.** The field is identified and understood; writing it is
  untested.
- **Button remapping.** Only `type 0x01` is decoded.
- The vendor's DPI validator wants EEPROM `0x0E` in 1..8 and `0x10` <= 8; real hardware reads
  `0x00` and `0x0f`, which would trip its `!!!!Error: wrong dpi data` path. Unexplained.

## Config model (from installer `app/Cfg.ini`)

    VID=0x3367  PID=0x1960 (wired)  PID2=0x1961 (receiver)
    Sensor=0x3370   CID=0x35   MID=0x01
    DPIRANGE = 50..10000 step 50, then 10100..19000 step 100
    DM=4 CPI stages, defaults 400/800/1600/3200
    DC = colours blue/green/yellow/red
    KM=12 button slots, entries (type, code, modifier, index)

Note the vendor GUI shows these defaults when it has **not** connected to a mouse — do not
mistake its sliders for the device's actual state.

## Method

Everything here was cross-checked against hardware rather than taken from the disassembly alone.
That mattered: several readings that looked well-supported turned out to be wrong, and only
physical measurement (`measure`, `polling_rate.py`, `cpi_compare.py`) caught them. The git
history keeps those corrections rather than tidying them away.
