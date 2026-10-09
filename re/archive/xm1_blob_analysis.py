# XM1 实测 blob（真机读取，2026-10-09）
# 来源：用户 XM1（VID 22D4 / PID 1803，固件 2.29）
# 前 256 字节（用户贴出的部分），完整 blob 应为 1024 字节
# 注意：这是**内部布局**（官方读路径 0x40FC80 末尾 call 0x4103D0 重排后的结果），
#       与写路径下发的**线上布局**（0x40FD60）不同。

HEX = """
000000: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
000010: 00 00 04 00 00 01 01 00 00 00 0d 00 00 00 0d 00
000020: 00 00 00 00 00 fd c4 15 0d 00 ff 00 0d ce 06 06
000030: 0d 00 01 ff 90 01 90 01 00 00 00 00 00 20 03 20
000040: 03 00 00 00 00 00 0b 00 00 00 00 00 00 00 00 00
000050: 00 ff 40 06 40 06 04 00 00 01 00 ff 80 0c 80 0c
000060: 00 00 00 00 00 00 01 00 00 00 00 0f 00 02 00 00
000070: 00 00 0f 00 04 00 00 00 00 0f 00 10 00 00 00 00
000080: 0f 00 08 00 00 00 00 0f 09 f1 00 00 00 00 0f 00
000090: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0000a0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0000b0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0000c0: 00 00 00 00 1c 7c 39 0d 00 00 00 00 0d 00 00 00
0000d0: 00 0d 00 00 00 00 0d 00 00 00 00 0d 00 00 00 00
0000e0: 0d 00 00 00 00 0d 00 00 00 00 00 00 00 00 00 00
0000f0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
"""


def load():
    b = bytearray(1024)
    for line in HEX.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        off_s, rest = line.split(":", 1)
        off = int(off_s, 16)
        for i, h in enumerate(rest.split()):
            b[off + i] = int(h, 16)
    return b


if __name__ == "__main__":
    b = load()

    print("=" * 70)
    print("1) 扫描所有 u16 小端值，筛选像 CPI/DPI 的（50–30000，且出现 >=2 次）")
    print("=" * 70)
    from collections import defaultdict
    pos = defaultdict(list)
    for i in range(0, 256 - 1):
        v = b[i] | (b[i + 1] << 8)
        if 50 <= v <= 30000:
            pos[v].append(i)
    # 只关心成对/多次出现的，且值本身是常见 DPI（2 的幂或 50 的倍数）
    for v in sorted(pos):
        if len(pos[v]) >= 2 and (v % 50 == 0 or (v & (v - 1)) == 0):
            print("  0x%04X (%5d)  出现 %d 次 @ %s" %
                  (v, v, len(pos[v]), ", ".join("0x%03X" % p for p in pos[v])))

    print()
    print("=" * 70)
    print("2) 试探 5 字节步长结构（4k 族 CPI 为 [flag][X:2][Y:2]）")
    print("=" * 70)
    for start in range(0x20, 0x70):
        ok = 0
        rows = []
        for n in range(4):
            o = start + 5 * n
            if o + 4 >= 256:
                break
            x = b[o + 1] | (b[o + 2] << 8)
            y = b[o + 3] | (b[o + 4] << 8)
            rows.append((o, b[o], x, y))
            if x == y and (50 <= x <= 30000 or x == 0):
                ok += 1
        if ok >= 3:
            print("  候选起点 0x%03X:" % start)
            for o, flag, x, y in rows:
                print("    [+%d] 0x%03X  flag=0x%02X  X=%5d  Y=%5d" % (o - start, o, flag, x, y))

    print()
    print("=" * 70)
    print("3) 定位所有 0x0d 字节（0x0d=13，疑似档位/按键类型标志）")
    print("=" * 70)
    ds = [i for i in range(256) if b[i] == 0x0D]
    print("  位置: %s" % ", ".join("0x%03X" % p for p in ds))
    print("  数量: %d" % len(ds))
    if len(ds) > 1:
        gaps = [ds[i + 1] - ds[i] for i in range(len(ds) - 1)]
        print("  间隔: %s" % gaps)

    print()
    print("=" * 70)
    print("4) 0x0C0 起的周期结构（疑似按键表）")
    print("=" * 70)
    for step in (5, 6, 7, 8):
        hits = sum(1 for i in range(0xC0, 0xF0) if b[i] == 0x0D)
        aligned = all((i - 0xC0) % step == 0 for i in range(0xC0, 0xF0) if b[i] == 0x0D)
        if aligned and hits >= 3:
            print("  步长 %d 对齐（0x0D 落在边界）" % step)
            for n in range(8):
                o = 0xC0 + step * n
                if o + step > 256:
                    break
                print("    [%d] 0x%03X: %s" % (n, o, " ".join("%02x" % b[o + k] for k in range(step))))
