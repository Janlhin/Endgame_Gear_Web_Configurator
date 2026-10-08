# 扫描 .text 中访问 [0x5866B0 .. 0x586740] 的全部指令，按对象偏移归类
import struct
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC
text = data[TEXT_OFF:TEXT_OFF+TEXT_SZ]

BASE = 0x5866B0
TOP = BASE + 0x90
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True

usage = {}
for v in range(BASE, TOP):
    pat = struct.pack('<I', v)
    s = 0
    while True:
        j = text.find(pat, s)
        if j < 0:
            break
        s = j + 1
        for k in range(1, 8):
            st = j - k
            if st < 0:
                continue
            try:
                ins = next(md.disasm(text[st:st+16], TEXT_VA + st))
            except StopIteration:
                continue
            if ins.address != TEXT_VA + st:
                continue
            if v - BASE <= 0 and ('0x%x' % v) not in ins.op_str:
                continue
            ok = False
            for tok in ins.op_str.replace('[', ' ').replace(']', ' ').replace(',', ' ').split():
                try:
                    vv = int(tok, 16)
                except ValueError:
                    continue
                if vv == v:
                    ok = True
                    break
            if ok:
                usage.setdefault(v - BASE, []).append((ins.address, '%s %s' % (ins.mnemonic, ins.op_str)))
            break

for off in sorted(usage):
    sites = usage[off]
    print('obj[0x%02X]: %d refs' % (off, len(sites)))
    for addr, mn in sites[:8]:
        print('    0x%06X  %s' % (addr, mn))
