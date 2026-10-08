"""查 XM1 CPI 每档第 2 字节（内部 0x21/0x27/0x2D/0x33）的去向。
若它既不参与重排 A（写）也不参与重排 B（读），说明它在协议里根本不存在，
即 XM1 的 CPI 记录中没有 XY 使能字段。"""
import sys, io, contextlib
sys.path.insert(0, '.')
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    from xm1_reorder_map import A_map, B_map

A_dst = set(A_map.keys())
A_src = set(A_map.values())
B_dst = set(B_map.keys())
B_src = set(B_map.values())

print('A_map %d 条（内部→线上）  B_map %d 条（线上→内部）' % (len(A_map), len(B_map)))
print()
print('=== 每档 6 字节各位置的重排情况 ===')
print('  %-10s %-22s %s' % ('内部偏移', '写路径(A)', '读路径(B)'))
for n, base in enumerate((0x20, 0x26, 0x2C, 0x32)):
    for k in range(6):
        o = base + k
        ds = [d for d, s in A_map.items() if s == o]
        w = ('线上 0x%03X' % ds[0]) if ds else '★ 不参与'
        r = 'B 会写入' if o in B_dst else '★ 不写'
        tag = ''
        if k == 0: tag = '  ← 启用标志'
        elif k == 1: tag = '  ← ? 待查'
        elif k in (2, 3): tag = '  ← X'
        else: tag = '  ← Y'
        print('  0x%02X      %-22s %s%s' % (o, w, r, tag))
    print()
