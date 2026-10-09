#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""x86 静态分析小工具：给"按官方设置来"这件事取证用。

为什么需要它：型号 PID、CPI 步进这类事实要**以官方工具二进制为准**，
而不是引用第三方实现。此前只能靠肉眼扫字节（push/cmp 立即数），
容易漏掉 `cmp dword ptr [ebp-4], imm32`、`imul` 这类形态。

用法：
  python re/upstream/disasm.py <exe> imms 30000 26000 50 10     # 找立即数并给上下文
  python re/upstream/disasm.py <exe> at 0x110F4F 40               # 反汇编某处 ±N 条
  python re/upstream/disasm.py <exe> str "CPI 1"                  # 找字符串 + 代码引用
  python re/upstream/disasm.py <exe> paths                       # 列 PDB/构建路径（模板证据）

依赖 capstone（已装在托管 venv 里）。只读，不碰设备。
"""
import struct
import sys

try:
    from capstone import Cs, CS_ARCH_X86, CS_MODE_32
    from capstone.x86_const import X86_OP_IMM, X86_OP_MEM
except ImportError:
    sys.exit("需要 capstone：pip install capstone")

SECT = {".text": (0x400000, 0x1000), ".rdata": (0x400000, 0x1000)}


def load(path):
    d = open(path, "rb").read()
    pe = d.find(b"PE\x00\x00")
    if pe < 0:
        sys.exit("不是 PE 文件")
    machine = struct.unpack_from("<H", d, pe + 4)[0]
    if machine != 0x14C:
        sys.exit("只支持 x86（machine=0x%04X）" % machine)
    nsec = struct.unpack_from("<H", d, pe + 6)[0]
    optsz = struct.unpack_from("<H", d, pe + 20)[0]
    imagebase = struct.unpack_from("<I", d, pe + 24 + 28)[0]
    secs, off = [], pe + 24 + optsz
    for i in range(nsec):
        raw = d[off + i * 40: off + i * 40 + 40]
        name = raw[:8].rstrip(b"\x00").decode("latin1")
        vsize, va, rsize, rptr = struct.unpack_from("<IIII", raw, 8)
        secs.append({"name": name, "va": va, "vsize": vsize, "rsize": rsize, "rptr": rptr})
    return d, imagebase, secs


def file_to_va(secs, imagebase, foff):
    for s in secs:
        if s["rptr"] <= foff < s["rptr"] + s["rsize"]:
            return imagebase + s["va"] + (foff - s["rptr"]), s["name"]
    return None, None


def va_to_file(secs, imagebase, va):
    for s in secs:
        lo = imagebase + s["va"]
        if lo <= va < lo + max(s["vsize"], s["rsize"]):
            return s["rptr"] + (va - lo), s["name"]
    return None, None


def code_ranges(secs, imagebase):
    return [(s["rptr"], s["rptr"] + s["rsize"], imagebase + s["va"], s["name"])
            for s in secs if s["name"] == ".text" or (s["rptr"] and s["rsize"])]


def disasm(d, secs, imagebase, start_va, count=40):
    foff, _ = va_to_file(secs, imagebase, start_va)
    if foff is None:
        return []
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.detail = True
    out = []
    for i in md.disasm(d[foff:foff + 512], start_va):
        out.append((i.address, i.mnemonic, i.op_str))
        if len(out) >= count:
            break
    return out


def cmd_imms(path, values):
    d, base, secs = load(path)
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.detail = True
    want = {int(v, 0) for v in values}
    for rptr, rend, va0, name in code_ranges(secs, base):
        if name != ".text":
            continue
        for i in md.disasm(d[rptr:rend], va0):
            for op in i.operands:
                if op.type == X86_OP_IMM and op.imm in want:
                    print("  0x%08X  %-6s %-30s   (%s+%d)" %
                          (i.address, i.mnemonic, i.op_str, want, op.imm))
                elif op.type == X86_OP_MEM and op.mem.disp in want and abs(op.mem.disp) > 0xFF:
                    pass  # 结构体偏移单独看，避免噪声


def cmd_at(path, addr, count):
    d, base, secs = load(path)
    va = int(addr, 0)
    print("--- 反汇编 0x%08X 起 %d 条 ---" % (va, count))
    for a, m, o in disasm(d, secs, base, va, count):
        foff, sec = va_to_file(secs, base, a)
        print("  %s 0x%08X  %-8s %s" % ("%-7s" % sec, a, m, o))


def cmd_str(path, needle):
    d, base, secs = load(path)
    for enc, label in (("utf-16-le", "UTF16"), ("latin1", "ASCII")):
        pat = needle.encode(enc) if enc != "latin1" else needle.encode("latin1")
        i = d.find(pat)
        if i < 0:
            continue
        va, sec = file_to_va(secs, base, i)
        print("  [%s] 文件偏移 0x%06X  VA 0x%08X (%s)" % (label, i, va or 0, sec))
        # 在 .text 里找 push 这个 VA 的地方（x86: 68 <va>）
        push = b"\x68" + struct.pack("<I", va)
        j = d.find(push)
        while j >= 0:
            jva, jsec = file_to_va(secs, base, j)
            print("      被引用 @ 0x%08X (%s)" % (jva or 0, jsec))
            for a, m, o in disasm(d, secs, base, jva - 24, 14):
                mark = ">>" if a == jva else "  "
                print("        %s 0x%08X  %-8s %s" % (mark, a, m, o))
            j = d.find(push, j + 1)


def cmd_paths(path):
    d, _, _ = load(path)
    seen = set()
    for m in __import__("re").finditer(rb"[A-Za-z]:\\\\[ -~]{10,120}\.pdb", d):
        s = m.group().decode("latin1")
        if s not in seen:
            seen.add(s); print("  ", s)
    for m in __import__("re").finditer(rb"[A-Za-z0-9_\\\\]{6,80}\\\\Release\\\\[ -~]{4,60}", d):
        s = m.group().decode("latin1")
        if s not in seen:
            seen.add(s); print("  ", s)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    path, cmd = sys.argv[1], sys.argv[2]
    if cmd == "imms":
        cmd_imms(path, sys.argv[3:])
    elif cmd == "at":
        cmd_at(path, sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 40)
    elif cmd == "str":
        cmd_str(path, sys.argv[3])
    elif cmd == "paths":
        cmd_paths(path)
    else:
        print(__doc__)