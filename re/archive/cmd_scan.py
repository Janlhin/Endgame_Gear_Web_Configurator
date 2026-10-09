# 扫描 .text 中 "mov dword ptr, 0xA1XX"（reportId+cmd 一次写入）与相邻指令
import struct
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC
text = data[TEXT_OFF:TEXT_OFF+TEXT_SZ]

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True

sites = []
i = 0
while i < len(text) - 8:
    if text[i] == 0xC7 and (text[i+1] & 0xC7) in (0x45, 0x85, 0x05, 0x40, 0x44, 0x80, 0x84):
        modrm = text[i+1]
        mod, reg, rm = modrm >> 6, (modrm >> 3) & 7, modrm & 7
        if reg == 0 and mod in (1, 2) and rm != 4:
            disp = text[i+2] if mod == 1 else struct.unpack_from('<i', text, i+2)[0]
            disp_len = 1 if mod == 1 else 4
            im = i + 2 + disp_len
            v = struct.unpack_from('<I', text, im)[0]
            if (v & 0xFFFF) >> 8 == 0xA1 or (v & 0xFF) == 0xA1:
                sites.append((TEXT_VA + i, v, disp))
    i += 1

print('cmd-word writes:', len(sites))
for addr, v, disp in sites:
    cmd = (v >> 8) & 0xFF
    print('  0x%06X  dword=0x%08X  reportId=0x%02X cmd=0x%02X' % (addr, v, v & 0xFF, cmd))
