"""定位 XM1 所有高层协议函数（命令码所在处）。

传输层已确证是 4 个小函数：
  0xF730 开设备 / 0xF7E0 SetFeature(带重试) / 0xF8A0 GetFeature / 0xF96A 查询
命令码在调用它们的高层函数里。本脚本穷举所有 call 到这 4 个地址的指令，
反查每个调用点所在函数并导出反汇编。

也顺带扫 `mov byte [ebp+d], imm8`（命令码可能是单字节逐字段写入），
以及 movzx/mov reg,imm8 形式。
"""
import struct, re, os, collections
from xm1_dis import load, r2o, disasm

TARGET = "xm1_main.exe"
SEND = 0x40F7E0      # SetFeature
RECV = 0x40F8A0      # GetFeature
QUERY = 0x40F96A
OPEN = 0x40F730

d, ib, secs = load(TARGET)
tseg = [s for s in secs if s[0] == ".text"][0]
tva, tvsz, tra, trsz = tseg[1], tseg[2], tseg[3], tseg[4]
text = d[tra:tra+trsz]


def callers(target_va):
    """找出所有 call rel32 指向 target_va 的位置"""
    out = []
    for i in range(len(text) - 5):
        if text[i] == 0xE8:
            rel = struct.unpack_from("<i", text, i + 1)[0]
            if ib + tva + i + 5 + rel == target_va:
                out.append(ib + tva + i)
    return out


def func_start(va):
    off = r2o(secs, va - ib)
    for back in range(off, max(0, off - 4000), -1):
        if d[back] == 0x55 and d[back+1] == 0x8B and d[back+2] == 0xEC:
            if all(b in (0xCC, 0xC3, 0x90, 0x00, 0x8B) for b in d[max(0, back-6):back]):
                return ib + tva + (back - tra)
    return None


os.makedirs("xm1_proto", exist_ok=True)
summary = []
for label, va in [("SEND", SEND), ("RECV", RECV), ("QUERY", QUERY), ("OPEN", OPEN)]:
    calls = callers(va)
    print("\n%s(0x%08X) 被调用 %d 处" % (label, va, len(calls)))
    for c in calls:
        fs = func_start(c)
        if fs is None:
            print("   call@0x%08X → 起点未定位" % c)
            continue
        fn = "xm1_proto/p_%s_%08X.txt" % (label, fs)
        if not os.path.exists(fn):
            lines = disasm(TARGET, fs - ib, 0x600)
            cut = len(lines)
            for idx, ln in enumerate(lines):
                if re.search(r"\sint3\s*$", ln) and idx > 5:
                    cut = idx
                    break
            with open(fn, "w", encoding="utf-8") as f:
                f.write("%s 层函数 0x%08X   (被 %s 调用 @0x%08X)\n" % (label, fs, label, c))
                f.write("=" * 62 + "\n")
                f.write("\n".join(lines[:cut]))
        print("   call@0x%08X → func 0x%08X  %s" % (c, fs, os.path.basename(fn)))
        summary.append((label, c, fs, fn))

print("\n\n=== 命令码候选：高层函数里的 0xA1 首字节写入 ===")
# 已在上一轮做过 dword 扫描；这里补充 byte 与 word 形式
cnt = collections.Counter()
loc = collections.defaultdict(list)
i = 0
while i < len(text) - 4:
    # C6 45 dd nn = mov byte [ebp+d], imm8
    if text[i] == 0xC6 and text[i+1] == 0x45:
        disp = struct.unpack_from("<b", text, i+2)[0]
        val = text[i+3]
        cnt[("byte", disp, val)] += 1
        loc[("byte", disp, val)].append(ib+tva+i)
        i += 4; continue
    # 66 C7 45 dd vvvv = mov word [ebp+d], imm16
    if text[i] == 0x66 and text[i+1] == 0xC7 and text[i+2] == 0x45:
        disp = struct.unpack_from("<b", text, i+3)[0]
        val = struct.unpack_from("<H", text, i+4)[0]
        cnt[("word", disp, val)] += 1
        loc[("word", disp, val)].append(ib+tva+i)
        i += 6; continue
    i += 1

print("  含 0xA1 的：")
for (kind, disp, val), n in sorted(cnt.items()):
    if val == 0xA1:
        print("    %s [ebp%+d] = 0x%02X   %d 处 %s" % (kind, disp, val, n, ["0x%X" % x for x in loc[(kind,disp,val)][:6]]))

print("\n  出现在协议函数窗口内的高频立即数（命令码候选）：")
wins = set()
for label, c, fs, fn in summary:
    if fs:
        wins.add(fs >> 8)
for (kind, disp, val), n in sorted(cnt.items(), key=lambda kv: -kv[1]):
    if val == 0xA1 or n < 2:
        continue
    if 0x03 <= val <= 0x7F and disp < -0x40:
        hits = [x for x in loc[(kind,disp,val)] if (x >> 8) in wins]
        if hits:
            print("    %s [ebp%+d] = 0x%02X (%3d) 协议窗口内 %d 处 %s" % (
                kind, disp, val, n, len(hits), ["0x%X" % x for x in hits[:5]]))
