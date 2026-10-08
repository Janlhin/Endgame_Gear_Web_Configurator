# -*- coding: utf-8 -*-
"""从 8k 有线族配置工具里挖 VID/PID 设备表。
4k 工具的同类表在二进制中是一组连续的 16-bit PID 常量，这里用同样的办法找。"""
import struct, sys, re, collections

path = sys.argv[1] if len(sys.argv) > 1 else "endgame-gear-xm2-8k-configuration-tool.v1.12.exe"
d = open(path, "rb").read()
print("文件 %s  %d B" % (path, len(d)))
print()

KNOWN_VIDS = {0x3367: "Endgame Gear (4k 族)", 0x22D4: "Endgame Gear (XM1 代)"}

print("=== 1) 已知 VID 的出现位置 ===")
for vid, name in KNOWN_VIDS.items():
    as_dw = struct.pack("<I", vid)
    as_w = struct.pack("<H", vid)
    dw = [i for i in range(len(d) - 4) if d[i:i+4] == as_dw]
    w = [i for i in range(len(d) - 2) if d[i:i+2] == as_w]
    print("  0x%04X (%s):  dword %d 处 %s   word %d 处 %s" %
          (vid, name, len(dw), [hex(x) for x in dw[:8]], len(w), [hex(x) for x in w[:8]]))
print()

print("=== 2) 扫描 16-bit 常量簇：候选 PID 表（值落在 0x1800-0x1AFF）===")
hits = collections.defaultdict(list)
for i in range(0, len(d) - 2):
    v = struct.unpack_from("<H", d, i)[0]
    if 0x1800 <= v <= 0x1AFF:
        hits[v].append(i)
# 只报出现 2 次以上、且位置较集中的值（表结构通常在一小段区域内重复）
print("  取值       次数   位置样例")
for v in sorted(hits):
    xs = hits[v]
    if len(xs) < 2:
        continue
    span = xs[-1] - xs[0]
    print("  0x%04X   %4d   %s%s" % (v, len(xs), [hex(x) for x in xs[:6]],
                                    "   ← 集中(跨度 %d)" % span if span < 0x2000 else ""))
print()

print("=== 3) 4k 工具已知 PID 在本文件中的出现 ===")
for pid in (0x1968, 0x1972, 0x1969, 0x1982, 0x1984, 0x1981, 0x1970):
    xs = [i for i in range(len(d) - 2) if d[i:i+2] == struct.pack("<H", pid)]
    print("  0x%04X : %d 处 %s" % (pid, len(xs), [hex(x) for x in xs[:6]]))
print()

print("=== 4) 型号名字符串（定位设备表附近的型号标识）===")
for m in re.finditer(rb"(?:[\x20-\x7e]\x00){4,}", d):
    s = m.group().decode("utf-16le", "replace").strip()
    if re.search(r"XM2|OP1|8k|8K", s) and len(s) < 70:
        print("  0x%06X  %s" % (m.start(), s))
