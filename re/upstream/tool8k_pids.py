# -*- coding: utf-8 -*-
"""扫出所有 `push imm32` 形式的 VID/PID 常量（x86: 68 XX XX 00 00）。
8k 工具的 HID 匹配是「VID 硬编码 + PID 逐对比较」，所以这类立即数就是设备表。"""
import struct, sys, re

path = sys.argv[1] if len(sys.argv) > 1 else "endgame-gear-xm2-8k-configuration-tool.v1.12.exe"
d = open(path, "rb").read()

print("=== A) 所有 push imm32 且值在 0x1800-0x1B00（候选 PID）或 0x33xx/0x22xx（VID）===")
rows = []
for i in range(len(d) - 5):
    if d[i] == 0x68:
        v = struct.unpack_from("<I", d, i + 1)[0]
        if 0x1800 <= v <= 0x1B00 or 0x3300 <= v <= 0x3400 or 0x2200 <= v <= 0x2300:
            rows.append((i, v))
for off, v in rows:
    tag = ""
    if 0x1800 <= v <= 0x1B00: tag = "PID?"
    elif 0x3300 <= v <= 0x3400: tag = "VID?"
    else: tag = "VID?(XM1 代)"
    print("  0x%06X  push 0x%04X   %s" % (off, v, tag))
print("  共 %d 处" % len(rows))
print()

print("=== B) 按值聚合 ===")
import collections
c = collections.Counter(v for _, v in rows)
for v, n in sorted(c.items()):
    offs = [o for o, x in rows if x == v]
    print("  0x%04X  x%-3d  %s" % (v, n, [hex(o) for o in offs[:8]]))
print()

print("=== C) 0x3367 附近 16 字节内是否紧随一个 0x19xx（VID/PID 配对）===")
for i in range(len(d) - 5):
    if d[i] == 0x68 and struct.unpack_from("<I", d, i + 1)[0] == 0x3367:
        win = d[i:i + 16]
        cands = []
        for k in range(0, 16):
            if k + 5 <= 16 and win[k] == 0x68:
                v = struct.unpack_from("<I", win, k + 1)[0]
                if 0x1800 <= v <= 0x1B00:
                    cands.append((k, v))
        print("  push 0x3367 @0x%06X  邻近 PID push: %s" %
              (i, [("+%d" % k, "0x%04X" % v) for k, v in cands] or "无（间隔 >16B）"))
print()

print("=== D) 搜 'PID' / 'VID' 字面量字符串 ===")
for m in re.finditer(rb"[ -~]{4,}", d):
    s = m.group().decode("latin1")
    if re.search(r"PID_|VID_|vid|pid", s) and len(s) < 60:
        print("  0x%06X  %s" % (m.start(), s))
