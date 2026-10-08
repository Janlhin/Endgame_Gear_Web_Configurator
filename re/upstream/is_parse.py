"""ISSetupStream 容器解析器（InstallShield Basic MSI 的 overlay 载荷区）。

结构（依据二进制实测 + InstallShield 公开资料）：
    [0..13]   magic "ISSetupStream\\0"
    [14..15]  u16 版本大 4
    [16..19]  u32 版本小 3
    ...       若干 u32 字段（0x2C 起含流数量/偏移/对齐等）
    [0x42..]  u16 名长 + UTF-16LE 文件名 + 0x00 00 + 16B GUID + 压缩数据
    ...       下一条记录以 "NO#" 流编号标记或下一个 UTF-16 名开头

每条记录的压缩数据段由 InstallShield 自有算法压缩（不是 zlib/deflate），
所以这里只负责**切出边界并落盘**，解压交给外部手段（见 README 备注）。
"""
import struct, sys, os, re

SRC = r"E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Configuration Software V1.09.exe"
OUT = "xm1_payload"

MAGIC = b"ISSetupStream\x00"
GUID_RE = re.compile(rb"(?:[\x20-\x7e]\x00){16,80}")   # UTF-16 可打印串（文件名）


def u16(b, o): return struct.unpack_from("<H", b, o)[0]
def u32(b, o): return struct.unpack_from("<I", b, o)[0]


def read_overlay(path):
    d = open(path, "rb").read()
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    secoff = coff + 20 + optsz
    end = 0
    for i in range(nsec):
        o = secoff + i * 40
        rsz, ra = struct.unpack_from("<I", d, o + 16)[0], struct.unpack_from("<I", d, o + 20)[0]
        if ra + rsz > end:
            end = ra + rsz
    return d, end


def parse(d, off):
    """返回 [(name, guid, data_start, data_len)]，尽力切分，失败则给单条大块。"""
    ov = d[off:]
    assert ov.startswith(MAGIC), "不是 ISSetupStream"
    recs = []
    # 从 0x42 之后开始找 UTF-16 文件名
    pos = 0x42
    names = []
    for m in GUID_RE.finditer(ov, 0x42):
        try:
            s = m.group().decode("utf-16le")
        except Exception:
            continue
        if not re.fullmatch(r"[A-Za-z0-9._\-() ]+", s):
            continue
        names.append((m.start(), m.end(), s))
    print("发现 %d 个 UTF-16 名称候选" % len(names))
    for idx, (ns, ne, s) in enumerate(names):
        # 名后：0x00 00 终止 + 16B GUID + 数据
        p = ne
        while p < len(ov) and not (ov[p] == 0 and ov[p + 1] == 0):
            p += 1
        p += 2
        guid = ov[p:p + 16]
        data_start = p + 16
        data_end = names[idx + 1][0] if idx + 1 < len(names) else len(ov)
        recs.append((s, guid, data_start, data_end - data_start))
    return recs, ov


def main():
    d, off = read_overlay(SRC)
    ov = d[off:]
    print("overlay: off=0x%X len=%d" % (off, len(ov)))
    recs, ov = parse(d, off)
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for s, guid, st, ln in recs:
        blob = ov[st:st + ln]
        safe = re.sub(r"[^\w.\-]", "_", s)
        fn = os.path.join(OUT, safe)
        with open(fn, "wb") as f:
            f.write(blob)
        head = blob[:16].hex(" ")
        manifest.append((s, ln, head))
        print("  %-40s %9d B  head=%s" % (s[:40], ln, head))
    print("\n共写出 %d 个块 -> %s/" % (len(recs), OUT))
    print("提示：数据段为 InstallShield 自有压缩，非 zlib，需外部解包器")


if __name__ == "__main__":
    main()
