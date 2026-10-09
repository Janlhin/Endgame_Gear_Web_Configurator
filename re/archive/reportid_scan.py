# 搜索 .text 中写入 0xA1 / 0xA0 报告 ID 的指令位置
import struct
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC
text = data[TEXT_OFF:TEXT_OFF+TEXT_SZ]

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True

hits = []
for i in range(len(text) - 8):
    # C6 /0 ib : mov r/m8, imm8 —— 找立即数为 0xA1/0xA0 的
    op = text[i]
    if op != 0xC6:
        continue
    modrm = text[i+1]
    mod, reg, rm = modrm >> 6, (modrm >> 3) & 7, modrm & 7
    if reg != 0:
        continue
    # 计算 imm8 的位置
    if mod == 0 and rm == 5:      # disp32
        im = i + 6
    elif mod == 1:                # disp8 (+sib)
        im = i + 3 + (1 if rm == 4 else 0)
    elif mod == 2:                # disp32 (+sib)
        im = i + 6 + (1 if rm == 4 else 0)
    elif mod == 3:                # reg
        im = i + 2
    else:
        continue
    if im + 1 > len(text):
        continue
    v = text[im]
    if v in (0xA1, 0xA0):
        hits.append((TEXT_VA + i, v, text[i:im+1].hex()))

print('mov imm8 A1/A0 sites:', len(hits))
for addr, v, raw in hits:
    print('  0x%06X  imm=0x%02X  %s' % (addr, v, raw))
