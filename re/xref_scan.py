# 扫描 x86 .text，找出 call/jmp 到 hidapi 函数的所有位置
import struct, sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

P = r'E:/IDM/Programs/Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe'
data = open(P, 'rb').read()

TEXT_VA, TEXT_OFF, TEXT_SZ = 0x1000, 0x400, 0x1313EC
text = data[TEXT_OFF:TEXT_OFF+TEXT_SZ]

HIDAPI = {
    0x32E0: 'hid_close', 0x28E0: 'hid_enumerate', 0x3430: 'hid_error',
    0x28B0: 'hid_exit', 0x2D80: 'hid_free_enumeration', 0x3260: 'hid_get_feature_report',
    0x33F0: 'hid_get_indexed_string', 0x3330: 'hid_get_manufacturer_string',
    0x3370: 'hid_get_product_string', 0x33B0: 'hid_get_serial_number_string',
    0x2860: 'hid_init', 0x2DD0: 'hid_open', 0x2EB0: 'hid_open_path',
    0x31E0: 'hid_read', 0x30D0: 'hid_read_timeout', 0x3230: 'hid_send_feature_report',
    0x3210: 'hid_set_nonblocking', 0x3010: 'hid_write',
}

def rva2off(rva):
    if TEXT_VA <= rva < TEXT_VA + TEXT_SZ:
        return TEXT_OFF + (rva - TEXT_VA)
    return None

# 扫描 E8/E9 rel32
targets = {}
for i in range(len(text) - 5):
    op = text[i]
    if op not in (0xE8, 0xE9):
        continue
    rel = struct.unpack_from('<i', text, i + 1)[0]
    dst = (TEXT_VA + i + 5 + rel) & 0xFFFFFFFF
    if dst in HIDAPI:
        callers = targets.setdefault(HIDAPI[dst], [])
        callers.append(TEXT_VA + i)

for name in ['hid_open', 'hid_enumerate', 'hid_open_path', 'hid_send_feature_report',
             'hid_get_feature_report', 'hid_write', 'hid_read_timeout', 'hid_read']:
    lst = targets.get(name, [])
    print('%-24s %d sites: %s' % (name, len(lst), ' '.join('0x%X' % a for a in lst)))
