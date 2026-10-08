# 扫描 .text 中所有访问 0x5866B0+N (N=0..0x90) 的指令位置
import struct
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC
text = data[TEXT_OFF:TEXT_OFF+TEXT_SZ]

BASE = 0x5866B0
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True

usage = {}   # objoff -> [(addr, bytes, mnem)]
i = 0
# 扫描含 disp32 的指令：粗扫所有 4 字节立即数等于 0x5866B0..0x586740 的位置，然后反汇编该指令
cand = []
start = 0
while True:
    j = text.find(struct.pack('<I', BASE), 0 if start == 0 else start)
    if j < 0:
        break
    # 候选：指令内 disp32 的位置 = j；指令起始 = j - k (k=2..7)
    for k in range(1, 8):
        s = j - k
        if s < 0:
            continue
        try:
            ins = next(md.disasm(text[s:s+16], TEXT_VA + s))
        except StopIteration:
            continue
        if ins.address != TEXT_VA + s:
            continue
        if BASE <= ins.address + 0:  # noqa
            pass
        # 检查该指令是否真的引用了 0x5866B0..0x586740 的内存
        txt = ins.op_str
        if '0x5866b' in txt or '0x5867' in txt:
            # 提取访问的地址
            for tok in txt.replace('[', ' ').replace(']', ' ').replace(',', ' ').split():
                try:
                    v = int(tok, 16)
                except ValueError:
                    continue
                if BASE <= v < BASE + 0x90:
                    off = v - BASE
                    usage.setdefault(off, []).append((ins.address, ins.mnemonic + ' ' + ins.op_str))
                    break
            break
    start = j + 1

for off in sorted(usage):
    sites = usage[off]
    print('obj[0x%02X]: %d refs' % (off, len(sites)))
    for addr, mn in sites[:6]:
        print('    0x%06X  %s' % (addr, mn))
