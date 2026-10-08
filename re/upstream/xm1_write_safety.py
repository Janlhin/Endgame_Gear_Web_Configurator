# -*- coding: utf-8 -*-
"""决定性问题：真机读到的 1024B（线上布局）里，所有非零字节是否都落在
写路径重排表 A 的目的偏移集合内？

若是 —— 官方写路径 memset(0) 后只填 A 覆盖的 166 个字节，说明其余字节对设备
       无意义；于是「读回 → 原样写回」是**可证明无损**的（配置一个字节都不会丢）。
       这为 XM1 写入提供了最短的验证路径：先做一次零改动的往返测试。

若否 —— 存在设备会读、但写入路径不落的字节，盲写有丢失风险。
"""
import base64
import io
import json

from xm1_reorder_map import A_map, B_map  # 复用已提取的映射表

DESK = r"C:\Users\Janlhin\Desktop"
FILES = [
    "egg-mouse-config-1791478301557.json",
    "egg-mouse-config-1791478153915.json",
]

print("A（写：内部→线上）目的偏移数: %d" % len(A_map))
print("B（读：线上→内部）目的偏移数: %d" % len(B_map))

A_dst = set(A_map.keys())
covered_by_A_from = set(A_map.values())      # A 会读取的内部偏移
B_src_used = set(B_map.values())             # B 实际读取的线上偏移
B_dst = set(B_map.keys())

for fn in FILES:
    p = DESK + "\\" + fn
    blob = base64.b64decode(json.load(io.open(p, encoding="utf-8"))["blobB64"])
    nz = [i for i, v in enumerate(blob) if v]
    out_of_A = [i for i in nz if i not in A_dst]
    print()
    print("=" * 70)
    print(fn)
    print("  非零字节 %d 个" % len(nz))
    print("  其中不在 A 目的集内的: %d 个  %s" % (len(out_of_A), " ".join("0x%03X" % i for i in out_of_A)))
    if not out_of_A:
        print("  => 全部非零字节都会被写路径写出：读-写往返可证明无损")
    print()
    print("  这些非零字节是否属于 B 的读取集合（即官方解析会用到的）？")
    nz_notB = [i for i in nz if i not in B_src_used]
    print("    非零但 B 不读的: %d 个  %s" % (len(nz_notB), " ".join("0x%03X" % i for i in nz_notB[:20])))

print()
print("=" * 70)
print("交叉验证：把真机 blob 依次过 B 再数内部布局的非零字节")
import collections
p = DESK + "\\" + FILES[0]
blob = base64.b64decode(json.load(io.open(p, encoding="utf-8"))["blobB64"])
internal = bytearray(1024)
for dst, src in B_map.items():
    internal[dst] = blob[src]
nz_int = [i for i, v in enumerate(internal) if v]
print("  内部布局非零 %d 个（线上 %d 个）" % (len(nz_int), sum(1 for v in blob if v)))
field = {
    "激活档索引 0x01A": 0x01A, "档1启用 0x020": 0x020, "档1 X 0x022": 0x022, "档1 Y 0x024": 0x024,
    "档2启用 0x026": 0x026, "档2 X 0x028": 0x028, "档2 Y 0x02A": 0x02A,
    "LOD 0x039": 0x039, "档3启用 0x02C": 0x02C, "档3 X 0x02E": 0x02E, "档3 Y 0x030": 0x030,
    "Ripple 0x01C": 0x01C, "档4启用 0x032": 0x032, "档4 X 0x034": 0x034, "档4 Y 0x036": 0x036,
}
u16 = lambda b, o: b[o] | (b[o + 1] << 8)
print()
print("  用【内部布局】偏移解码真机数据（应与官方 UI 一致）：")
print("    激活档索引 = %d -> 显示 CPI %d" % (internal[0x01A], internal[0x01A] + 1))
for n, (fx, fy, fl) in enumerate([(0x022, 0x024, 0x020), (0x028, 0x02A, 0x026),
                                  (0x02E, 0x030, 0x02C), (0x034, 0x036, 0x032)]):
    on = internal[fl] == 0
    print("    CPI %d: %-4s X=%5d Y=%5d" % (n + 1, "On" if on else "Off", u16(internal, fx), u16(internal, fy)))
print("    LOD raw=%d -> %.1f mm" % (internal[0x039], (internal[0x039] + 4) / 5))
print("    Ripple = %s" % ("On" if internal[0x01C] else "Off"))
