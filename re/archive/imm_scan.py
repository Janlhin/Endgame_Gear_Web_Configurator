# 找 .text 中引用指定地址（immediate）的位置
import struct, sys

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()
TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC

def find_imm(val, name):
    pat = struct.pack('<I', val)
    hits = []
    start = 0
    while True:
        i = data.find(pat, start)
        if i < 0:
            break
        rva = i - TEXT_OFF + TEXT_VA
        if TEXT_OFF <= i < TEXT_OFF + TEXT_SZ:
            hits.append(rva)
        start = i + 1
    print('%s (0x%X): %s' % (name, val, ', '.join('0x%X' % h for h in hits[:40]) if hits else 'NONE'))

for val, name in [
    (0x5866B0, 'blobObj'),      # blob 解析目标对象
    (0x5862A8, 'blobBuf'),      # 1024B blob 全局
    (0x57FC78, 'devType'),
    (0x57FC7C, 'devState'),
    (0x587300, 'vidpidTbl'),
    (0x1B1714, 'str_ApplyLedSettings'),
    (0x1B133C, 'str_SurfaceCalibration'),
    (0x1B0CD8, 'str_CPILevels'),
    (0x1B2244, 'str_MulticlickNote'),
    (0x1B270C, 'str_PairDongle'),
    (0x1B2744, 'str_PairDefault'),
    (0x1B277C, 'str_GetPairData'),
    (0x1B2B9A, 'str_Open'),
    (0x1B2BA4, 'str_SaveAs'),
    (0x15D77E, 'str_FwUpdater'),
]:
    find_imm(val, name)
