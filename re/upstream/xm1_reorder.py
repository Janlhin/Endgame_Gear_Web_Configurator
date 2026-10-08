# -*- coding: utf-8 -*-
"""分析 XM1 官方的两个「重排」函数，判定它们究竟是
   ① 两个缓冲区之间的字节置换（permutation），还是
   ② 别的东西（读入/写出/校验）。

这决定 XM1 写入能否采用「读回原始 1024B → 只改已知字段 → 原样写回」的安全策略：
若读布局 == 写布局，则读-改-写是**可证明安全**的（未识别字节逐字节保留）。
"""
import collections
import re

from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from xm1_dis import load, disasm

EXE = "xm1_main.exe"
d, ib, secs = load(EXE)
tseg = [s for s in secs if s[0] == ".text"][0]
TVA, TRA, TRSZ = tseg[1], tseg[3], tseg[4]
text = d[TRA:TRA + TRSZ]

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = False


def r2o(rva):
    for nm, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None


def func_lines(rva, maxlen=0x2000):
    """反汇编到第一个 0xC3(ret) 之后紧跟 int3 填充的位置。"""
    off = r2o(rva)
    if off is None:
        return []
    out = []
    for ins in md.disasm(d[off:off + maxlen], ib + TVA + rva):
        out.append("%08X  %-20s %s %s" % (ins.address, ins.bytes.hex(" "), ins.mnemonic, ins.op_str))
        if ins.mnemonic == "ret":
            break
    return out


def analyze(name, rva):
    lines = func_lines(rva)
    print("=" * 72)
    print("%s  (0x%X)  —— %d 条指令" % (name, ib + rva, len(lines)))
    print("=" * 72)
    ops = collections.Counter(l.split()[2] if len(l.split()) > 2 else "?" for l in lines)
    print("指令分布（top 12）：")
    for m, n in ops.most_common(12):
        print("   %-8s %d" % (m, n))
    # 关键模式统计
    pats = {
        "movzx r32, byte ptr [...]": r"movzx e\w+, byte ptr \[",
        "movzx r32, word ptr [...]": r"movzx e\w+, word ptr \[",
        "mov r8, byte ptr [...]": r"mov [a-d]l, byte ptr \[",
        "mov byte ptr [...], r8": r"mov byte ptr \[[^\]]+\], [a-d]l",
        "mov word ptr [...], r16": r"mov word ptr \[[^\]]+\], [a-d]x",
        "mov dword ptr [...], r32": r"mov dword ptr \[[^\]]+\], e[a-d]x",
        "rep movs": r"rep movs",
        "lea r32, [ebp": r"lea e\w+, \[ebp",
        "test/jz": r"^(test|jz|je|jne|jnz)\b",
        "call": r"^call",
    }
    print()
    print("模式统计：")
    for k, p in pats.items():
        n = sum(1 for l in lines if re.search(p, l[19:].strip()))
        print("   %-28s %d" % (k, n))
    print()
    print("前 28 条：")
    for l in lines[:28]:
        print("   ", l)
    print()
    print("末 10 条：")
    for l in lines[-10:]:
        print("   ", l)
    return lines


L1 = analyze("0x40FD60  重排 A", 0xFD60)
print()
L2 = analyze("0x4103D0  重排 B", 0x103D0)
