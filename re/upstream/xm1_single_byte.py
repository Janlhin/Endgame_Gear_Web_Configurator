"""定位 XM1 单字节命令对（0x40FA30 读 / 0x40FAE0 写）的调用点与用途。

目的：查明「回报率」是否存在配置 blob 之外（很可能走单字节命令），
以及它由官方软件的哪个界面/函数下发。
"""
import re
import struct
import sys

from xm1_dis import load, disasm

EXE = "xm1_main.exe"

d, ib, secs = load(EXE)
tseg = [s for s in secs if s[0] == ".text"][0]
TVA, TRA, TRSZ = tseg[1], tseg[3], tseg[4]
text = d[TRA:TRA + TRSZ]


def r2o(rva):
    for nm, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None


def func_start(va, span=8000):
    off = r2o(va - ib)
    if off is None:
        return None
    for back in range(off, max(0, off - span), -1):
        if d[back] == 0x55 and d[back + 1] == 0x8B and d[back + 2] == 0xEC:
            if all(b in (0xCC, 0xC3, 0x90, 0x00, 0x8B) for b in d[max(0, back - 6):back]):
                return ib + TVA + (back - TRA)
    return None


def callers(target):
    out = []
    for i in range(len(text) - 5):
        if text[i] == 0xE8:
            rel = struct.unpack_from("<i", text, i + 1)[0]
            if ib + TVA + i + 5 + rel == target:
                out.append(ib + TVA + i)
    return out


print("=" * 70)
print("1) 应用自有 RTTI 类名（揭示对话框/页面结构）")
print("=" * 70)
names = sorted(set(m.group(1).decode("latin1")
                   for m in re.finditer(rb"\.\?AV([A-Za-z0-9_@?$]+)@@", d)))
interesting = [n for n in names if re.search(r"(Dlg|Page|View|Tab|Panel|Sheet|Wnd|Ctrl|Button|Led|Light|Cpi|CPI|Profile|Macro|Adv)", n)]
for n in interesting:
    print("   ", n)

print()
print("=" * 70)
print("2) 单字节命令的调用点")
print("=" * 70)
for label, target in [("cmd 0x03 读字节 (0x40FA30)", 0x40FA30),
                      ("cmd 0x04 写字节 (0x40FAE0)", 0x40FAE0)]:
    cs = callers(target)
    print()
    print("%s —— %d 个调用点" % (label, len(cs)))
    for c in cs:
        fs = func_start(c)
        print("   call @0x%08X   所属函数 ≈ 0x%s" % (c, format(fs, "X") if fs else "?"))

print()
print("=" * 70)
print("3) 写字节调用点前后的取值来源（找 0x04 被传入什么）")
print("=" * 70)
for c in callers(0x40FAE0):
    fs = func_start(c)
    print()
    print("---- call @0x%08X（函数 0x%s）----" % (c, format(fs, "X") if fs else "?"))
    if fs:
        # 反汇编该调用点前 60 条指令
        back = 0x120
        lines = disasm(EXE, (c - back) - ib, back + 0x10)
        for l in lines[-42:]:
            print("   ", l)
