"""XM1 实测 blob 结构分析（1024 字节，真机读取）。

数据来源：用户导出的 egg-mouse-config-*.json（blobB64）
分析目标：找出定长表的步长与起点，为后续差分定位做准备。
"""
import base64, json, os, sys
from collections import defaultdict

JSON_PATH = r"C:\Users\Janlhin\Desktop\egg-mouse-config-1791477693094.json"
BIN_OUT = "xm1_blob_2026-10-09.bin"


def load_blob():
    d = json.load(open(JSON_PATH, encoding="utf-8"))
    blob = base64.b64decode(d["blobB64"])
    with open(BIN_OUT, "wb") as f:
        f.write(blob)
    return blob


b = load_blob()

print("=" * 74)
print("0) blob 概览：%d 字节，非零区段" % len(b))
print("=" * 74)
nz = [i for i in range(len(b)) if b[i] != 0]
if nz:
    print("  非零范围 0x%03X – 0x%03X，共 %d 个非零字节" % (nz[0], nz[-1], len(nz)))
    # 连续非零段
    segs = []
    for i in nz:
        if segs and i == segs[-1][1] + 1:
            segs[-1][1] = i
        else:
            segs.append([i, i])
    for s, e in segs:
        if e - s >= 1:
            print("    [0x%03X – 0x%03X]  %2d B" % (s, e, e - s + 1))

print()
print("=" * 74)
print("1) 结构发现：某字节值以固定步长重复（找定长表的起点）")
print("=" * 74)
for step in range(3, 13):
    best = []
    for start in range(0, 0x100):
        pos = [start + step * n for n in range(20) if start + step * n < len(b)]
        if len(pos) < 4:
            break
        vals = [b[p] for p in pos]
        # 第一列非零且至少 4 项相同或构成规律
        if vals[0] != 0 and len(set(vals)) <= 4:
            best.append((start, vals))
    if best:
        for start, vals in best:
            if len(vals) >= 4:
                print("  步长 %2d  起点 0x%03X  首列值: %s" %
                      (step, start, " ".join("%02x" % v for v in vals[:10])))

print()
print("=" * 74)
print("2) 所有 u16 小端值，出现 >= 2 次且像 DPI/LED 的")
print("=" * 74)
pos16 = defaultdict(list)
for i in range(len(b) - 1):
    v = b[i] | (b[i + 1] << 8)
    pos16[v].append(i)
for v in sorted(pos16):
    if len(pos16[v]) >= 2 and v != 0:
        interesting = (50 <= v <= 30000) or (v <= 0x100)
        if interesting:
            tag = ""
            if 50 <= v <= 20000:
                tag = "  ← 像 DPI"
            elif v in (2, 4, 8, 16, 32, 64, 128):
                tag = "  ← 像回报率/枚举"
            print("  0x%04X (%6d) x%d @ %s%s" %
                  (v, v, len(pos16[v]), ", ".join("0x%03X" % p for p in pos16[v][:8]), tag))

print()
print("=" * 74)
print("3) 重点区段 0x060–0x090（发现 7 字节步长的 0x0F 前缀表）")
print("=" * 74)
print("  按 7 字节切分（起点 0x06B）：")
for n in range(6):
    o = 0x06B + 7 * n
    if o + 7 > len(b):
        break
    row = b[o:o + 7]
    v16 = row[2] | (row[3] << 8)
    print("    [%d] 0x%03X: %s   → 若 [2:4] 为 u16 = %d (0x%04X)" %
          (n, o, " ".join("%02x" % x for x in row), v16, v16))

print()
print("=" * 74)
print("4) 重点区段 0x0C0–0x0EA（发现 5 字节步长的 0x0D 前缀表）")
print("=" * 74)
print("  按 5 字节切分（起点 0x0C7）：")
for n in range(8):
    o = 0x0C7 + 5 * n
    if o + 5 > len(b):
        break
    row = b[o:o + 5]
    print("    [%d] 0x%03X: %s" % (n, o, " ".join("%02x" % x for x in row)))

print()
print("=" * 74)
print("5) CPI 候选值及其完整上下文（前后各 6 字节）")
print("=" * 74)
for val, name in [(400, "400"), (800, "800"), (1600, "1600"), (3200, "3200")]:
    for p in pos16.get(val, []):
        lo = max(0, p - 6); hi = min(len(b), p + 8)
        ctx = b[lo:hi]
        mark = " ".join((">>%02x<< " % ctx[i - lo]) if lo + i in (p, p + 1) else "%02x " % ctx[i - lo]
                        for i in range(len(ctx)))
        print("  %s @0x%03X:  %s" % (name, p, mark))

print()
print("已保存原始 blob →", BIN_OUT)
