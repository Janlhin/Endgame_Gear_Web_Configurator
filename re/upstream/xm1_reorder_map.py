# -*- coding: utf-8 -*-
"""精确提取 XM1 两个重排函数的字节映射（修正寄存器别名：edx/dl 共用槽位）。"""
import re
from collections import defaultdict

from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from xm1_dis import load

EXE = "xm1_main.exe"
d, ib, secs = load(EXE)
tseg = [s for s in secs if s[0] == ".text"][0]
TVA, TRA = tseg[1], tseg[3]
md = Cs(CS_ARCH_X86, CS_MODE_32)

ALIAS = {
    "eax": "ax", "ax": "ax", "al": "ax", "ah": "ax",
    "ebx": "bx", "bx": "bx", "bl": "bx", "bh": "bx",
    "ecx": "cx", "cx": "cx", "cl": "cx", "ch": "cx",
    "edx": "dx", "dx": "dx", "dl": "dx", "dh": "dx",
    "esi": "si", "si": "si", "edi": "di", "di": "di",
    "ebp": "bp", "esp": "sp",
}


def canon(r):
    return ALIAS.get(r, r)


def insns(rva, maxlen=0x2000):
    off = TRA + (rva - TVA)
    out = []
    for ins in md.disasm(d[off:off + maxlen], 0x1000):
        out.append(ins)
        if ins.mnemonic == "ret":
            break
    return out


def mem_off(op, base):
    m = re.match(r"^(?:byte|word|dword) ptr \[%s(?:\s*\+\s*(0x[0-9a-f]+|\d+))?\]$" % base, op)
    if m:
        return int(m.group(1), 16) if m.group(1) else 0
    m = re.match(r"^\[%s(?:\s*\+\s*(0x[0-9a-f]+|\d+))?\]$" % base, op)
    if m:
        return int(m.group(1), 16) if m.group(1) else 0
    return None


def trace(name, rva):
    seq = insns(rva)
    sym = defaultdict(list)
    recs = []
    for ins in seq:
        m, ops = ins.mnemonic, ins.op_str
        parts = [p.strip() for p in ops.split(",")] if ops else []

        if m == "mov" and parts[:2] == ["byte ptr [esi]", "bl"]:
            recs.append(("LOOP", "1..16", 1))
            continue
        if m in ("mov", "movzx", "movsx") and len(parts) == 2:
            o = mem_off(parts[1], "ecx")
            if o is not None:
                sym[canon(parts[0])] = [(o, 0)]
                continue
        if m in ("shl", "sal") and len(parts) == 2 and parts[1] in ("8", "0x8"):
            if canon(parts[0]) in sym:
                sym[canon(parts[0])] = [(s, sh + 8) for s, sh in sym[canon(parts[0])]]
            continue
        if m == "or" and len(parts) == 2:
            sym[canon(parts[0])] = sym.get(canon(parts[0]), []) + sym.get(canon(parts[1]), [])
            continue
        if m == "mov" and len(parts) == 2 and parts[0].startswith(("byte ptr [eax", "word ptr [eax", "dword ptr [eax")):
            width = 1 if parts[0].startswith("byte") else (2 if parts[0].startswith("word") else 4)
            dst = mem_off(parts[0], "eax")
            recs.append((list(sym.get(canon(parts[1]), [])), dst, width))
            continue
    print("=" * 74)
    print("%s  (RVA 0x%X) —— %d 条指令 / %d 条映射" % (name, rva, len(seq), len(recs)))
    print("=" * 74)
    bmap, words, loops = {}, [], 0
    for srcs, dst, width in recs:
        if srcs == "LOOP":
            loops += 1
            continue
        if width == 1 and len(srcs) == 1:
            bmap[dst] = srcs[0][0]
        elif width == 2:
            words.append((sorted(srcs), dst))
    dup = [k for k in bmap if list(bmap).count(k) > 1]
    print("单字节 %d 条 | word %d 条 | 前缀循环 %d 条 | 目的偏移重复 %d" % (len(bmap), len(words), loops, 0))
    print()
    print("非恒等映射（dst != src），共 %d 条：" % sum(1 for k, v in bmap.items() if k != v))
    for k in sorted(bmap):
        if bmap[k] != k:
            print("   dst[0x%03X] <- src[0x%03X]" % (k, bmap[k]))
    print()
    print("恒等映射 dst == src 的偏移： %s" % " ".join("0x%03X" % k for k in sorted(bmap) if bmap[k] == k))
    print()
    print("word 映射（目的 <- 两个源字节，<<8 表示高位）：")
    for srcs, dst in words:
        print("   dst[0x%03X] <- %s" % (dst, " | ".join("src[0x%03X]%s" % (s, " <<8" if sh else "") for s, sh in srcs)))
    return bmap, words


A_map, A_words = trace("重排 A 0x40FD60（写：内部 -> 线上）", 0xFD60)
print()
B_map, B_words = trace("重排 B 0x4103D0（读：线上 -> 内部）", 0x103D0)

print()
print("=" * 74)
print("互逆检验：A == B 的逆？")
print("=" * 74)
inv = {v: k for k, v in A_map.items()}
common = sorted(set(B_map) & set(inv))
mismatch = [(k, B_map[k], inv[k]) for k in common if B_map[k] != inv[k]]
print("A 单字节 %d 条 / B 单字节 %d 条 / 共同目的 %d 条 / 源不同 %d 条"
      % (len(A_map), len(B_map), len(common), len(mismatch)))
for k, b, a in mismatch[:20]:
    print("   dst[0x%03X]: B<-0x%03X 但 A^-1<-0x%03X" % (k, b, a))
print("B 侧独有的目的偏移： %s" % " ".join("0x%03X" % k for k in sorted(set(B_map) - set(inv))[:20]))
print("A 侧独有的目的偏移： %s" % " ".join("0x%03X" % k for k in sorted(set(inv) - set(B_map))[:20]))
