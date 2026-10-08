# 反汇编指定 RVA 区域
import sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC

def rva2off(rva):
    for nm, va, ra, sz in [('.text', 0x1000, 0x400, 0x1313EC), ('.rdata', 0x133000, 0x131800, 0x46346),
                           ('.data', 0x17A000, 0x177C00, 0xE47C), ('.rsrc', 0x189000, 0x17DA00, 0x37588),
                           ('.reloc', 0x1C1000, 0x1B5000, 0x2B3BC)]:
        if va <= rva < va + sz:
            return ra + (rva - va)
    return None

start = int(sys.argv[1], 16)
n = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x100
off = rva2off(start)
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True
for ins in md.disasm(data[off:off+n], start):
    print('0x%06X  %-22s %s %s' % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
