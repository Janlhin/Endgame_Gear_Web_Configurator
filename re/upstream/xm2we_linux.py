#!/usr/bin/env python3
"""
xm2we - read battery level (and probe) an Endgame Gear XM2we via its 2.4GHz dongle.

Protocol (reverse-engineered from the vendor XM2we Configuration Software v1.0):
  Transport : HID feature report 0x08 (17 bytes) out, input report 0x09 (17 bytes) in,
              on the interface exposing vendor usage page 0xFF02 / usage 0x02.
  Framing   : [0]=report id, [1]=opcode, [2..15]=payload, [16]=checksum
  Checksum  : (0x55 - sum(bytes[0..15])) & 0xFF
  Reply     : [1]=opcode echo, [5]=data length, [6..]=data
  Opcode 04 : battery -> data[0] = percent (0-100), data[1] = charging flag
"""
import fcntl, os, select, sys, time, glob

VID, PIDS = 0x3367, (0x1961, 0x1960)          # 1961 = dongle, 1960 = wired
MARKER = bytes([0x06, 0x02, 0xff, 0x09, 0x02, 0xa1, 0x01, 0x85, 0x08])  # FF02/usage2, report 8
MOUSE_MARKER = bytes([0x05, 0x01, 0x09, 0x02, 0xa1, 0x01, 0x09, 0x01, 0xa1, 0x00])  # the pointer collection

def _IOC(d, t, nr, size): return (d << 30) | (size << 16) | (ord(t) << 8) | nr
def HIDIOCSFEATURE(n):    return _IOC(3, 'H', 0x06, n)

def find_device():
    """Return the hidraw path carrying the vendor command collection."""
    for path in sorted(glob.glob('/sys/class/hidraw/hidraw*')):
        try:
            uevent = open(os.path.join(path, 'device/uevent')).read()
            desc   = open(os.path.join(path, 'device/report_descriptor'), 'rb').read()
        except OSError:
            continue
        for pid in PIDS:
            if f'HID_ID=0003:{VID:08X}:{pid:08X}' in uevent and MARKER in desc:
                return '/dev/' + os.path.basename(path)
    return None

def find_mouse():
    """The sibling interface carrying pointer reports (7-byte: btn, dx16, dy16, wheel, pan)."""
    for path in sorted(glob.glob('/sys/class/hidraw/hidraw*')):
        try:
            uevent = open(os.path.join(path, 'device/uevent')).read()
            desc   = open(os.path.join(path, 'device/report_descriptor'), 'rb').read()
        except OSError:
            continue
        for pid in PIDS:
            if f'HID_ID=0003:{VID:08X}:{pid:08X}' in uevent and desc.startswith(MOUSE_MARKER):
                return '/dev/' + os.path.basename(path)
    return None

def frame(opcode, payload=b''):
    b = bytearray(17)
    b[0], b[1] = 0x08, opcode
    b[2:2 + len(payload)] = payload
    b[16] = (0x55 - sum(b[0:16])) & 0xFF
    return bytes(b)

def valid(resp):
    return len(resp) == 17 and (sum(resp) & 0xFF) == 0x55

def query(fd, opcode, payload=b'', timeout=1.0, retries=3):
    for _ in range(retries):
        while select.select([fd], [], [], 0)[0]:            # drain stale input
            try: os.read(fd, 64)
            except OSError: break
        fcntl.ioctl(fd, HIDIOCSFEATURE(17), bytearray(frame(opcode, payload)), True)
        deadline = time.time() + timeout
        while time.time() < deadline:
            if select.select([fd], [], [], 0.1)[0]:
                try: resp = os.read(fd, 64)
                except OSError: continue
                if valid(resp) and resp[1] == opcode:
                    return resp
    return None

def battery(fd):
    r = query(fd, 0x04)
    if r is None:
        return None
    n = r[5]
    if n < 1 or r[6] > 100:
        return None
    return r[6], (r[7] if n > 1 else 0)

# ---------------------------------------------------------------- EEPROM (read-only)
EE_CHUNK = 10                      # data fits in report bytes [6..15]

def ee_read(fd, addr, n, wake_timeout=8.0):
    """Read n bytes (<=10) at addr, waiting out sleep.

    EEPROM access needs a real round-trip to the mouse, and the mouse sleeps after a
    few seconds idle - unlike battery/link, which the receiver answers from cache.
    So keep asking until it wakes rather than failing on the first silence.
    """
    deadline = time.time() + wake_timeout
    while True:
        r = query(fd, 0x08, bytes([0x00, (addr >> 8) & 0xFF, addr & 0xFF, n]),
                  timeout=0.3, retries=1)
        if r is not None and r[5] == n and (r[3] << 8 | r[4]) == addr:
            return r[6:6 + n]
        if time.time() >= deadline:
            return None

def ee_dump(fd, ranges):
    """ranges: list of (start, end_inclusive). Returns {addr: byte}."""
    mem = {}
    for lo, hi in ranges:
        addr = lo
        while addr <= hi:
            n = min(EE_CHUNK, hi - addr + 1)
            d = ee_read(fd, addr, n)
            if d is None:
                raise IOError(
                    f'EEPROM read timed out at 0x{addr:03x} - the mouse is asleep.\n'
                    'Move the mouse and run this again (reading the config needs it awake).')
            for i, b in enumerate(d):
                mem[addr + i] = b
            addr += n
    return mem

CFG_RANGES = [(0x00, 0xBF), (0x100, 0x17F)]

def ck(*vals):
    """The device's checksum idiom, used for both frames and stored records."""
    return (0x55 - sum(vals)) & 0xFF

def decode_cpi(mem):
    """0x0C-0x2B: eight [x, y, mul, crc] records. CPI = (x+1) * (50 or 100)."""
    out = []
    for i in range(8):
        a = 0x0C + i * 4
        x, y, mul, crc = (mem.get(a + k) for k in range(4))
        if None in (x, y, mul, crc):
            continue
        step = 100 if mul else 50
        out.append({
            'slot': i + 1,
            'x': (x + 1) * step,
            'y': (y + 1) * step,
            'raw': (x, y, mul, crc),
            'ok': crc == ck(x, y, mul),
        })
    return out

BTN_BITS = [(0x01, 'left'), (0x02, 'right'), (0x04, 'middle'),
            (0x08, 'back'), (0x10, 'forward')]

def decode_keys(mem):
    """0x60-0x9F: sixteen [type, code, param, crc] records."""
    out = []
    for i in range(16):
        a = 0x60 + i * 4
        typ, code, param, crc = (mem.get(a + k) for k in range(4))
        if None in (typ, code, param, crc):
            continue
        if typ == 0 and code == 0:
            label = '(unassigned)'
        elif typ == 1:
            names = [n for bit, n in BTN_BITS if code & bit]
            label = 'mouse: ' + ('+'.join(names) if names else f'0x{code:02x}')
        else:
            label = f'type 0x{typ:02x} code 0x{code:02x} param 0x{param:02x}'
        out.append({'slot': i + 1, 'label': label,
                    'raw': (typ, code, param, crc),
                    'ok': crc == ck(typ, code, param)})
    return out

def polling_rate(mem):
    """Polling rate from the header one-hot mask at 0x00.

    Verified by measuring HID report timing: 0x08=125, 0x04=250, 0x02=500,
    0x01=1000 Hz, i.e. rate = 1000 // mask. The button on the mouse cycles this
    field - it does NOT change the CPI stage.
    """
    v = paired(mem, 0x00)
    if v is None or v == 0 or (v & (v - 1)):        # must be exactly one bit
        return None
    return 1000 // v

def paired(mem, addr):
    """Records stored as value followed by its 0x55-complement. None if it doesn't check."""
    v, c = mem.get(addr), mem.get(addr + 1)
    return v if v is not None and c == ck(v) else None


def main():
    dev = find_device()
    if not dev:
        sys.exit('XM2we receiver not found (is the dongle plugged in?)')
    try:
        fd = os.open(dev, os.O_RDWR | os.O_NONBLOCK)
    except PermissionError:
        sys.exit(f'{dev}: permission denied - run with sudo or install the udev rule')

    arg = sys.argv[1] if len(sys.argv) > 1 else 'battery'

    if arg == 'battery':
        # Ask for the battery *first*. The reading stays valid while the 2.4GHz link
        # is momentarily down - which is exactly what happens the instant a charging
        # cable is plugged in. Checking the link first would blind us right then.
        b = battery(fd)
        if b is None:
            link = query(fd, 0x03)
            if link is None or link[6] == 0:
                sys.exit('mouse is offline - move it or switch it on')
            sys.exit('no valid battery reply')
        pct, chg = b
        link = query(fd, 0x03)
        note = '  (charging)' if chg else ''
        if link is None or link[6] == 0:
            note += '  (link down, last known)'
        bar = '#' * (pct // 5) + '.' * (20 - pct // 5)
        print(f'XM2we  [{bar}] {pct}%{note}')
    elif arg == 'raw':
        for op in (0x03, 0x04, 0x0f):
            r = query(fd, op)
            print(f'0x{op:02x} -> ' + (' '.join(f'{x:02x}' for x in r) if r else '(no reply)'))
    elif arg == 'watch':
        try:
            while True:
                b = battery(fd)
                stamp = time.strftime('%H:%M:%S')
                print(f'{stamp}  {b[0]}%  charging={b[1]}' if b else f'{stamp}  offline', flush=True)
                time.sleep(30)
        except KeyboardInterrupt:
            pass
    elif arg == 'config':
        mem = ee_dump(fd, CFG_RANGES)
        hz = polling_rate(mem)
        if hz:
            print(f'Polling rate: {hz} Hz')
        print('\nStored CPI table:')
        for s in decode_cpi(mem):
            xy = f"{s['x']}" if s['x'] == s['y'] else f"{s['x']}x{s['y']}"
            print(f"  {s['slot']}: {xy:>11} cpi{'' if s['ok'] else '  [BAD CHECKSUM]'}")
        print('  note: slot 1 is the CPI actually in use. Whether the other slots are\n'
              '  reachable depends on the CPI Stages count. See PROTOCOL.md.')
        dbn = paired(mem, 0xA9)
        if dbn is not None:
            print(f'\nDebounce: {dbn} ms')
        print('\nButtons:')
        for k in decode_keys(mem):
            if k['label'] == '(unassigned)':
                continue
            print(f"  {k['slot']:2}: {k['label']}{'' if k['ok'] else '  [BAD CHECKSUM]'}")

    elif arg == 'backup':
        if len(sys.argv) < 3:
            sys.exit(f'usage: {sys.argv[0]} backup <file>')
        mem = ee_dump(fd, CFG_RANGES)
        with open(sys.argv[2], 'w') as fh:
            fh.write('# XM2we EEPROM backup - addr: bytes\n')
            for lo, hi in CFG_RANGES:
                for row in range(lo, hi + 1, 16):
                    cells = ' '.join(f'{mem[a]:02x}' for a in range(row, min(row + 16, hi + 1)) if a in mem)
                    fh.write(f'{row:04x}: {cells}\n')
        print(f'{len(mem)} bytes saved to {sys.argv[2]}')

    elif arg == 'measure':
        import struct
        mdev = find_mouse()
        if not mdev:
            sys.exit('could not find the pointer interface')
        # Measure FIRST: the stroke is what wakes the mouse, and the EEPROM cannot be
        # read while it sleeps. Reading the stage up front just times out.
        print('Move the mouse in one straight line a distance you can measure, then stop.')
        mfd = os.open(mdev, os.O_RDONLY | os.O_NONBLOCK)
        while select.select([mfd], [], [], 0)[0]:
            try: os.read(mfd, 64)
            except OSError: break
        cx = cy = 0
        started = False
        idle_since = time.time()
        while True:
            if select.select([mfd], [], [], 0.1)[0]:
                try: d = os.read(mfd, 64)
                except OSError: continue
                if len(d) >= 5:
                    dx, dy = struct.unpack_from('<hh', d, 1)
                    if dx or dy:
                        cx += dx; cy += dy; started = True; idle_since = time.time()
            elif started and time.time() - idle_since > 2.0:
                break
            elif not started and time.time() - idle_since > 20:
                sys.exit('no movement seen')
        dist = (cx ** 2 + cy ** 2) ** 0.5
        print(f'counts: dx={cx} dy={cy}  (magnitude {dist:.0f})')
        try:                                   # mouse is awake now, so this will answer
            mem = ee_dump(fd, [(0x00, 0x2B)])
            cpi = next((s['x'] for s in decode_cpi(mem) if s['slot'] == 1), None)
            print(f'CPI slot 1 (the one in use) stores {cpi} cpi')
        except IOError:
            cpi = None
        print('Actual cpi = counts / (distance moved in inches), i.e. counts / (cm / 2.54).')
        if cpi:
            print(f'For {cpi} cpi that is {dist / cpi * 2.54:.1f} cm - compare with what you moved.')

    else:
        sys.exit(f'usage: {sys.argv[0]} [battery|raw|watch|config|backup <file>|measure]')

if __name__ == '__main__':
    try:
        main()
    except IOError as e:
        sys.exit(str(e))
    except KeyboardInterrupt:
        pass
