# 在整个镜像中搜索 16/32 位立即数（协议常量）
import struct

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()

SECS = [('.text', 0x1000, 0x400, 0x1313EC), ('.rdata', 0x133000, 0x131800, 0x46346),
        ('.data', 0x17A000, 0x177C00, 0xE47C), ('.rsrc', 0x189000, 0x17DA00, 0x37588),
        ('.reloc', 0x1C1000, 0x1B5000, 0x2B3BC)]

def rva2off(rva):
    for nm, va, ra, sz in SECS:
        if va <= rva < va + sz:
            return ra + (rva - va)
    return None

def off2rva(off):
    for nm, va, ra, sz in SECS:
        if ra <= off < ra + sz:
            return va + (off - ra)
    return None

CONSTS = {
    0x22D4: 'VID 22D4', 0x1502: 'PID 1502', 0x1503: 'PID 1503',
    0x3367: 'VID 3367', 0x1970: 'PID dongle-1970', 0x1968: 'PID 1968',
    0x1972: 'PID 1972', 0x1982: 'PID 1982', 0x1984: 'PID 1984',
}

for val, label in CONSTS.items():
    pat16 = struct.pack('<H', val)
    pat32 = struct.pack('<I', val)
    hits = []
    start = 0
    while True:
        i = data.find(pat32, start)
        if i < 0:
            break
        rva = off2rva(i)
        sec = next((nm for nm, va, ra, sz in SECS if rva is not None and va <= rva < va + sz), '?')
        if sec in ('.text', '.rdata', '.data'):
            hits.append('%s@0x%X' % (sec, rva))
        start = i + 1
    # also word writes in code: C705 addr val32 handled above; mov reg, imm16: 66 B8+r / BA.. use pattern B8+r + val16
    for op in range(0xB8, 0xC0):  # mov eax..edi, imm32 (32bit form) covered; imm16 via 66 prefix
        pat = bytes([0x66, op]) + pat16
        s = 0
        while True:
            i = data.find(pat, s)
            if i < 0:
                break
            rva = off2rva(i)
            if rva is not None and 0x1000 <= rva < 0x1323EC:
                hits.append('.text mov16@0x%X' % rva)
            s = i + 1
    print('%-16s: %s' % (label, ', '.join(hits[:24]) if hits else 'NONE'))
