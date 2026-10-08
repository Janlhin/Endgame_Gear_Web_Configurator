"""解析 InstallShield setup.exe 的 ISSetupStream overlay，提取内嵌文件。
格式（公开逆向结论）：40 字节头('ISSetupStream')后，每条记录 =
u32 nameLen | name(ANSI) | u32 uncompressedSize | u32 compressedSize | data(zlib 或原始)
"""
import struct, zlib, os, sys

SRC = r'E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Configuration Software V1.09.exe'
OUT = 'xm1_payload'

data = open(SRC, 'rb').read()
# 定位 overlay：节表末尾
e = struct.unpack_from('<I', data, 0x3C)[0]
coff = e + 4
nsec = struct.unpack_from('<H', data, coff + 2)[0]
optsz = struct.unpack_from('<H', data, coff + 16)[0]
secoff = coff + 20 + optsz
end = 0
for i in range(nsec):
    o = secoff + i * 40
    rsz = struct.unpack_from('<I', data, o + 16)[0]
    ra = struct.unpack_from('<I', data, o + 20)[0]
    if ra + rsz > end:
        end = ra + rsz
ov = data[end:]
assert ov.startswith(b'ISSetupStream'), 'overlay 头不符'

# 头部字段：magic(14) + ... 取 zlib 起点
p = 0
while p < len(ov) and ov[p] == 0 or (p < 64 and not (ov[p] & 0x78) ):
    p += 1
print('跳过 %d 字节头' % p)

os.makedirs(OUT, exist_ok=True)
found = []
while p + 8 <= len(ov):
    nameLen = struct.unpack_from('<I', ov, p)[0]
    if nameLen == 0 or nameLen > 260:
        break
    try:
        name = ov[p+4:p+4+nameLen].split(b'\0')[0].decode('ascii')
    except Exception:
        break
    p += 4 + nameLen
    if p + 8 > len(ov):
        break
    usize, csize = struct.unpack_from('<II', ov, p)
    p += 8
    if csize == 0 or usize == 0 or csize > len(ov) - p or usize > 200 * 1024 * 1024:
        print('  尺寸异常 usize=%d csize=%d @0x%X → 停止' % (usize, csize, p))
        break
    blob = ov[p:p+csize]
    p += csize
    out = blob
    if csize != usize:
        try:
            out = zlib.decompress(blob)
        except Exception as ex:
            print('  zlib 失败 %s: %s (csize=%d)' % (name, ex, csize))
            continue
    safe = name.replace('\\', '_').replace('/', '_').replace(':', '_')
    with open(os.path.join(OUT, safe), 'wb') as f:
        f.write(out)
    found.append((name, usize, len(out)))

for n, u, o_ in found:
    print('  %-46s %9d → %9d B' % (n, u, o_))
print('共提取', len(found), '个文件到', OUT + '/')