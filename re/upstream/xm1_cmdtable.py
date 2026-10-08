"""XM1 命令表提取：报告头为 dword，首字节必为 0xA1（读报告）或 0x??01（命令报告）。

4k 族已知：命令报告首字节 0xA1，第二字节是命令码（0x0F/0x12/0x14/0x15/0x16/0x70…）。
XM1 里 mov dword [ebp+disp], 0x??01 即「报告ID=0x??, 命令码=0x01」这类布局，
而 0x3A1 说明这里首字节是 0xA1、第二字节 0x03、第三字节 0x01 → 命令码在第 3 字节。
故扫 mov word [buf], imm16 与 mov dword [buf], imm32 两类。
"""
import struct, collections
from xm1_dis import load, EXE

d, imagebase, secs = load(EXE)
for nm, va, vsz, ra, rsz in secs:
    if nm == ".text":
        tva, tra, trsz = va, ra, rsz
        break
text = d[tra:tra+trsz]

hits = collections.defaultdict(list)

i = 0
while i < len(text) - 6:
    # C7 45 dd imm32  /  C7 85 dddd imm32   mov dword [ebp+d], imm32
    if text[i] == 0xC7:
        modrm = text[i+1]
        mod = (modrm >> 6) & 3; reg = (modrm >> 3) & 7; rm = modrm & 7
        if reg == 0 and rm == 5 and mod in (1, 2):
            dl = 1 if mod == 1 else 4
            v = struct.unpack_from("<I", text, i+2+dl)[0]
            if v <= 0xFFFFFF and (v & 0xFF) == 0xA1:      # 首字节 = 0xA1（报告 ID）
                hits[v].append(tva + i)
            i += 2+dl+4; continue
    # 66 C7 45 dd imm16  /  66 C7 85 mov word [ebp+d], imm16
    if text[i] == 0x66 and text[i+1] == 0xC7:
        modrm = text[i+2]
        mod = (modrm >> 6) & 3; reg = (modrm >> 3) & 7; rm = modrm & 7
        if reg == 0 and rm == 5 and mod in (1, 2):
            dl = 1 if mod == 1 else 4
            v = struct.unpack_from("<H", text, i+3+dl)[0]
            if (v & 0xFF) == 0xA1:
                hits[v].append(tva + i)
            i += 3+dl+2; continue
    i += 1

print("=== 报告头（首字节 0xA1）出现值 ===")
for v in sorted(hits):
    b = [(v >> (8*k)) & 0xFF for k in range(v.bit_length() // 8 + 1)]
    print("  dword 0x%06X  → 字节 %s   (%d 处: %s)" % (
        v, " ".join("%02X" % x for x in reversed(b)), len(hits[v]),
        ", ".join("0x%X" % x for x in hits[v][:8])))

# 扫 mov byte [buf], imm  且 imm 为小命令码（0x01..0x7F），在 HID 通讯函数附近（0xF000-0x11000）
print("\n=== 通讯函数区(0xF000-0x11000)内的报告字节写入 ===")
near = collections.defaultdict(list)
i = 0
while i < len(text) - 3:
    if text[i] == 0xC6:
        modrm = text[i+1]
        mod = (modrm >> 6) & 3; reg = (modrm >> 3) & 7; rm = modrm & 7
        if reg == 0 and rm == 5 and mod in (1, 2):
            dl = 1 if mod == 1 else 4
            disp = struct.unpack_from("<b", text, i+2)[0] if mod == 1 else struct.unpack_from("<i", text, i+2)[0]
            val = text[i+2+dl]
            rva = tva + i
            if 0xF000 <= rva <= 0x11000:
                near[disp].append((rva, val))
            i += 2+dl+1; continue
    i += 1
for disp in sorted(near):
    vals = sorted(set(v for _, v in near[disp]))
    print("  [ebp%+d]  值集 %s   (%d 处)" % (disp, [hex(v) for v in vals], len(near[disp])))
