#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""XM1 差分定位器：比较两份 1024B blob，标出变了哪些字节。

用法：
    python re/xm1_diff.py 基线.bin 改动后.bin
    python re/xm1_diff.py 基线.bin 改动后.bin --json     # 额外输出可粘贴的 JSON

输入可以是 .bin（导出按钮「导出原始 1024B blob」），也可以是 hex 文本文件。
输出：
  ① 差异总览（多少个字节变了、落在哪些区间）
  ② 逐字节/逐区间明细：旧值 → 新值、是否已在可编辑集合、已知字段注解
  ③ u16 LE 解读（CPI 档位是 2 字节小端）
  ④ 结论模板（贴回会话即可判断字段语义）

★ 只做**只读分析**，不碰设备、不写任何东西。
"""
import json
import sys

# 与 src/blob.ts 的 XM1_F / src/protocol.ts 的 XM1_EDITABLE_OFFSETS 保持一致
EDITABLE = {
    0x032: "激活档索引",
    0x033: "档1 启用位", 0x034: "档1 X(低)", 0x035: "档1 X(高)", 0x036: "档1 Y(低)", 0x037: "档1 Y(高)",
    0x03C: "档2 启用位", 0x03D: "档2 X(低)", 0x03E: "档2 X(高)", 0x03F: "档2 Y(低)", 0x040: "档2 Y(高)",
    0x046: "Lift Cut-Off (5×mm−4)",
    0x051: "档3 启用位", 0x052: "档3 X(低)", 0x053: "档3 X(高)", 0x054: "档3 Y(低)", 0x055: "档3 Y(高)",
    0x057: "Ripple Control",
    0x05B: "档4 启用位", 0x05C: "档4 X(低)", 0x05D: "档4 X(高)", 0x05E: "档4 Y(低)", 0x05F: "档4 Y(高)",
}
U16_PAIRS = {0x034: "档1 X", 0x036: "档1 Y", 0x03D: "档2 X", 0x03F: "档2 Y",
             0x052: "档3 X", 0x054: "档3 Y", 0x05C: "档4 X", 0x05E: "档4 Y"}


def load(path):
    """自动识别输入：1024B 二进制 blob，或 hex 文本（可含换行/空格/冒号偏移前缀）。"""
    raw = open(path, "rb").read()
    ok_hex = set(b"0123456789abcdefABCDEF \t\r\n:")
    if all(c in ok_hex for c in raw):                     # 纯 hex 文本
        digits = "".join(chr(c) for c in raw if c in b"0123456789abcdefABCDEF")
        if len(digits) >= 2048:
            return [int(digits[i:i + 2], 16) for i in range(0, 2048, 2)]
    return list(raw[:1024])                               # 否则按二进制 blob


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(1)
    a, b = load(args[0]), load(args[1])
    if len(a) != len(b):
        print("⚠ 两份长度不同：%d vs %d（只比较前 %d 字节）" % (len(a), len(b), min(len(a), len(b))))
    n = min(len(a), len(b))
    diffs = [i for i in range(n) if a[i] != b[i]]

    print("=" * 72)
    print("XM1 差分：%s  →  %s" % (args[0].split("/")[-1], args[1].split("/")[-1]))
    print("=" * 72)
    if not diffs:
        print("两份完全一致 —— 说明改动**没有落进 blob**（可能写在别的通道，或官方软件没保存）。")
        return
    print("变化字节：%d 个，偏移 %s" % (len(diffs), "、".join("0x%03X" % i for i in diffs[:40])))

    # 连续区间
    runs, cur = [], [diffs[0]]
    for i in diffs[1:]:
        if i == cur[-1] + 1:
            cur.append(i)
        else:
            runs.append(cur); cur = [i]
    runs.append(cur)

    print()
    print("① 差异明细（按连续区间）")
    for r in runs:
        lo, hi = r[0], r[-1]
        old = [a[i] for i in r]
        new = [b[i] for i in r]
        tag = []
        for i in r:
            if i in EDITABLE:
                tag.append("%s(已知可写)" % EDITABLE[i])
        print("  0x%03X–0x%03X (%d B)" % (lo, hi, len(r)))
        print("    旧: %s" % " ".join("%02X" % v for v in old))
        print("    新: %s" % " ".join("%02X" % v for v in new))
        if tag:
            print("    注解: %s" % "、".join(sorted(set(tag))))
        else:
            print("    注解: ⚠ 不在已核实的可写集合里（新字段候选，需再复现一次才敢用）")

    print()
    print("② u16 LE 解读（CPI 档位是 2 字节小端）")
    for off, name in sorted(U16_PAIRS.items()):
        if off in diffs or (off + 1) in diffs:
            va = a[off] | (a[off + 1] << 8)
            vb = b[off] | (b[off + 1] << 8)
            print("  0x%03X %s: %d → %d" % (off, name, va, vb))
    if 0x046 in diffs:
        print("  0x046 LOD: 原始 %d→%d  ⇒ %.1fmm → %.1fmm（编码 5×mm−4）"
              % (a[0x046], b[0x046], (a[0x046] + 4) / 5 if a[0x046] else 0,
                 (b[0x046] + 4) / 5 if b[0x046] else 0))
    if 0x032 in diffs:
        print("  0x032 激活档: %d → %d（0-based）" % (a[0x032], b[0x032]))
    if 0x057 in diffs:
        print("  0x057 Ripple: %d → %d（0=Off / 1=On）" % (a[0x057], b[0x057]))

    print()
    print("③ 结论模板（贴回会话）")
    print("  改动项：________________（官方软件里改的是哪一项、改成什么）")
    print("  变化偏移：" + " ".join("0x%03X:%02X→%02X" % (i, a[i], b[i]) for i in diffs))
    if "--json" in sys.argv:
        print()
        print(json.dumps({"changed": [{"off": i, "old": a[i], "new": b[i],
                                       "known": EDITABLE.get(i, None)} for i in diffs]},
                         ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
