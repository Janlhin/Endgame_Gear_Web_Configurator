# -*- coding: utf-8 -*-
"""定位「单字节」的语义：cmd 0x03 读出的字节去哪里了？obj+4 又是什么？

三条线索：
  1. 读事务 0x418F80 里 cmd 0x03 的 1 字节结果是否被消费（存入对象？）
  2. 解析器 0x40E550 是否会写 obj+4（若会，说明 obj+4 来自 blob，cmd 0x04 只是回声）
  3. 打包器 0x40E0D0 是否读 obj+4（若会，说明该字节也会进 blob）
"""
import re

from xm1_dis import load, disasm

EXE = "xm1_main.exe"
d, ib, secs = load(EXE)
tseg = [s for s in secs if s[0] == ".text"][0]
TVA, TRA = tseg[1], tseg[3]


def lines(rva, n, skip=0):
    return disasm(EXE, rva - ib, n)[skip:]


def show(title, rva, n, filt=None, limit=60):
    print("=" * 74)
    print("%s  (0x%X)" % (title, rva))
    print("=" * 74)
    out = lines(rva, n)
    shown = 0
    for l in out:
        if filt and not re.search(filt, l):
            continue
        print("   ", l)
        shown += 1
        if shown >= limit:
            print("    ...（截断）")
            break
    print()
    return out


# 1) 读事务：cmd 0x03 的结果缓冲 [esp+0x17] 之后有没有被读
seq = show("读事务 0x418F80 —— cmd03 调用前后（完整）", 0x418F80, 0x160)
print(">>> 对 [esp+0x17] 的引用：")
for l in seq:
    if "esp + 0x17" in l or "esp+0x17" in l:
        print("   ", l)

# 2) 解析器 / 打包器 是否触碰对象偏移 4
for name, rva in (("解析器 0x40E550（缓冲区 → 对象）", 0x40E550),
                  ("打包器 0x40E0D0（对象 → 缓冲区）", 0x40E0D0)):
    full = lines(rva, 0x140)
    print()
    print("=" * 74)
    print(name)
    print("=" * 74)
    print("   前 20 条：")
    for l in full[:20]:
        print("      ", l)
    hits = [l for l in full if re.search(r"\[e[a-d]x \+ 4\]|\[e[a-d]i \+ 4\]|\[esi \+ 4\]|\[edi \+ 4\]", l)]
    print("   命中「基址 + 4」的指令 %d 条：" % len(hits))
    for l in hits[:10]:
        print("      ", l)
