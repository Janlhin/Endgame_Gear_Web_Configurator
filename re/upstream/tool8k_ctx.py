# -*- coding: utf-8 -*-
"""dump 0x3367 出现位置的上下文，判断是设备表还是代码立即数。"""
import struct, sys

path = sys.argv[1] if len(sys.argv) > 1 else "endgame-gear-xm2-8k-configuration-tool.v1.12.exe"
d = open(path, "rb").read()

# 节表（来自 tool8k_id.py 的输出）
secs = [(".text", 0x1000, 0x173E00), (".rdata", 0x175000, 0x51400),
        (".data", 0x1C7000, 0x5600), (".rsrc", 0x1D2000, 0x1EA00),
        (".reloc", 0x1F1000, 0x22A00)]

def off2sec(off):
    # 用 PE 节表里的 PointerToRawData 精确映射
    pe = struct.unpack_from("<I", d, 0x3C)[0]
    nsec = struct.unpack_from("<H", d, pe + 6)[0]
    optsz = struct.unpack_from("<H", d, pe + 20)[0]
    base = pe + 24 + optsz
    imgbase = struct.unpack_from("<I", d, pe + 52)[0]
    out = []
    for i in range(nsec):
        o = base + 40 * i
        name = d[o:o+8].rstrip(b"\0").decode("latin1")
        vsz, va, rsz, ra = struct.unpack_from("<IIII", d, o + 8)
        out.append((name, va, vsz, ra, rsz))
    for name, va, vsz, ra, rsz in out:
        if ra <= off < ra + rsz:
            return ("%s RVA=0x%X" % (name, va + (off - ra)), imgbase, out)
    return ("(不在任何节)", imgbase, out)

for off in (0x35bc, 0x1079c, 0x19f2ec):
    sec, imgbase, secs2 = off2sec(off)
    print("=" * 68)
    print("文件偏移 0x%X   %s" % (off, sec))
    lo = max(0, off - 48); hi = min(len(d), off + 48)
    for i in range(lo, hi, 16):
        c = d[i:i+16]
        mark = " <<<" if i <= off < i + 16 else ""
        print("  0x%06X  %-47s  %s%s" % (i, c.hex(" "),
              "".join(chr(b) if 32 <= b < 127 else "." for b in c), mark))
print()
print("=== 该偏移处的 16-bit 值 ===（若为设备表，附近应有成串的 0x19xx）")
for off in (0x35bc, 0x1079c):
    vals = [struct.unpack_from("<H", d, off + 2 * k)[0] for k in range(-4, 12)]
    print("  0x%06X 前后 16-bit: %s" % (off, " ".join("0x%04X" % v for v in vals)))
