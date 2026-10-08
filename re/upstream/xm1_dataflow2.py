# -*- coding: utf-8 -*-
"""修正调用点扫描的 VA 计算（应用 TVA 而非 TRA），并提取 0x40FD60 的置换表。"""
import collections
import re
import struct

from xm1_dis import load, disasm

EXE = "xm1_main.exe"
d, ib, secs = load(EXE)
tseg = [s for s in secs if s[0] == ".text"][0]
TVA, TRA, TRSZ = tseg[1], tseg[3], tseg[4]
text = d[TRA:TRA + TRSZ]

TARGETS = {
    0x40FD60: "重排 A（纯字节置换，写路径调用）",
    0x4103D0: "重排 B（含位域打包）",
    0x40E0D0: "打包器 对象→缓冲区",
    0x40E550: "解析器 缓冲区→对象",
    0x40FAE0: "cmd 0x04 写单字节",
    0x40FA30: "cmd 0x03 读单字节",
}


def callers_of(va):
    """E8 rel32 相对调用；VA = ib + TVA + text_index。"""
    out = []
    for i in range(len(text) - 5):
        if text[i] == 0xE8:
            rel = struct.unpack_from("<i", text, i + 1)[0]
            if ib + TVA + i + 5 + rel == va:
                out.append(ib + TVA + i)
    return out


def func_start(va, span=9000):
    off = TRA + (va - ib - TVA)
    for back in range(off, max(0, off - span), -1):
        if d[back] == 0x55 and d[back + 1] == 0x8B and d[back + 2] == 0xEC:
            if all(b in (0xCC, 0xC3, 0x90, 0x00, 0x8B) for b in d[max(0, back - 6):back]):
                return ib + TVA + (back - TRA)
    return None


print("=" * 72)
print("调用关系（已修正 VA 计算）")
print("=" * 72)
for va, name in TARGETS.items():
    cs = callers_of(va)
    print("%-34s 0x%08X  被 %d 处调用" % (name, va, len(cs)))
    for c in cs:
        fs = func_start(c)
        print("      call @0x%08X   ∈ 函数 ≈ 0x%s" % (c, format(fs, "X") if fs else "?"))

print()
print("=" * 72)
print("0x40FB90（写 blob）完整反汇编 —— 看重排的输入/输出缓冲")
print("=" * 72)
for l in disasm(EXE, 0xFB90 - ib, 0x120):
    print("   ", l)
    if re.search(r"\sret\s*$", l):
        break
