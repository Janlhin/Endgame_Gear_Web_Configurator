# -*- coding: utf-8 -*-
"""判定 XM1 读写两条路径上的数据流方向，并提取两个「重排」函数的字节映射。

关键问题：读回来的原始 1024B 与写出去的 1024B 是否同一套布局？
  - 若是，则写入可采用「读回原始 → 只改已知字段 → 原样写回」，未识别字节
    逐字节保留，是**可证明安全**的（不需要理解那层重排）。
  - 若不是，则必须先实现重排层才能写。
"""
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
    0x40FD60: "重排 A（纯字节置换）",
    0x4103D0: "重排 B（含位域打包）",
    0x40E0D0: "打包器（对象 → 缓冲区）",
    0x40E550: "解析器（缓冲区 → 对象）",
    0x40FC80: "读 blob（cmd 0x07）",
    0x40FB90: "写 blob（cmd 0x08）",
    0x418F80: "读取事务",
    0x41A070: "应用事务",
}


def callers(target):
    out = []
    for i in range(len(text) - 5):
        if text[i] == 0xE8:
            rel = struct.unpack_from("<i", text, i + 1)[0]
            if ib + TRA + i + 5 + rel == target:
                out.append(ib + TRA + i)
    return out


print("=" * 72)
print("调用关系（谁调用谁）")
print("=" * 72)
for va, name in TARGETS.items():
    cs = callers(va)
    print("%-28s 0x%08X  被 %d 处调用: %s" % (name, va, len(cs), " ".join("0x%08X" % c for c in cs) or "—"))

print()
print("=" * 72)
print("0x40FC80（读）与 0x40FB90（写）内部调用了什么")
print("=" * 72)
for va, name in ((0x40FC80, "读 blob"), (0x40FB90, "写 blob")):
    rva = va - ib
    lines = disasm(EXE, rva, 0x400)
    print()
    print("--- %s (0x%08X) ---" % (name, va))
    for l in lines:
        if re.search(r"\bcall\b", l) or re.search(r"^\s*[0-9A-F]+\s+[0-9a-f ]+\s+ret\b", l):
            print("   ", l)
        if re.search(r"\sret\s*$", l):
            break
