"""扫描 InstallShield overlay 内所有 zlib 流并解压，按内容识别 PE/MSI。
绕过 ISSetupStream 私有头部格式：逐个 zlib 流尝试解压，取有效输出。
"""
import re, zlib, os

SRC = r'E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Configuration Software V1.09.exe'
OUT = 'xm1_payload'
os.makedirs(OUT, exist_ok=True)

data = open(SRC, 'rb').read()
e = 0x14EA00  # 节表末尾（overlay 起点）
ov = data[e:]

hits = []
for m in re.finditer(b'\x78[\x9c\xda\x5e]', ov):
    off = m.start()
    try:
        do = zlib.decompressobj()
        out = do.decompress(ov[off:off + 64 * 1024 * 1024])
        if len(out) >= 512:
            hits.append((off, out))
    except Exception:
        pass

print('可解压 zlib 流:', len(hits))
seen = {}
for off, out in hits:
    kind = '?'
    if out[:2] == b'MZ':
        kind = 'PE'
    elif out[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        kind = 'OLE/MSI'
    elif out[:4] == b'PK\x03\x04':
        kind = 'ZIP'
    elif out[:2] == b'\x1f\x8b':
        kind = 'GZIP'
    elif out[:5] == b'<?xml':
        kind = 'XML'
    h = zlib.crc32(out[:4096]) & 0xffffffff
    key = (kind, h, len(out))
    if key in seen:
        continue
    seen[key] = True
    name = 'stream_%08X_%s_%dB.bin' % (off, kind, len(out))
    open(os.path.join(OUT, name), 'wb').write(out)
    print('  @0x%06X  %-8s %9d B  %s' % (off, kind, len(out), name))