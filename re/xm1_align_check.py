"""XM1 与 4k 族样式对齐检查：无头加载 index.html 的 #layout=xxx 预览，读回页面结构。

验证两族**视觉同构**的关键断言（2026-10-20 样式统一的回归护栏）：
  1. TABLE  传感器表都是 5 个列头，且**表头文本完全相同**
  2. NOTE   型号说明在右栏的折叠卡里（#sensorNoteBody），不再塞进 tbody
  3. PRESET 预设条只在 4k 族可见（XM1 的预设写不进固件）
  4. ROWS   已删除的 #cpiLevels / #cpiActive 下拉不再出现在 DOM 里
  5. RENDER 两族都渲染完成

不连接任何设备 —— 纯静态渲染验证。
用法：python re/xm1_align_check.py
"""
import os, re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = "file:///" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html")).replace(os.sep, "/")
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

fails = []


def want(cond, name, extra=""):
    if cond:
        print("  OK   " + name)
    else:
        print("  FAIL " + name + ("  -> " + extra if extra else ""))
        fails.append(name)


def dump(kind):
    url = BASE + "#layout=" + kind
    return subprocess.run(
        [EDGE, "--headless=new", "--virtual-time-budget=2500", "--dump-dom", url],
        capture_output=True, encoding="utf-8", errors="replace").stdout


# 探针：把文档高度写回 <title>，用来判断有没有纵向滚动。
PROBE = """
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var de = document.documentElement;
    document.title = 'PROBE docH=' + de.scrollHeight + '/' + window.innerHeight;
  }, 700);
});
</script>
"""


def dump_probe(kind, w, h):
    """在指定视口下加载并读回探针结果。"""
    import tempfile
    src = open(SRC, encoding="utf-8").read()
    html = src.replace("</body>", PROBE + "</body>")
    td = tempfile.mkdtemp(prefix="egg-align-")
    tmp = os.path.join(td, "p.html")
    open(tmp, "w", encoding="utf-8").write(html)
    out = subprocess.run(
        [EDGE, "--headless=new", "--disable-gpu", "--no-sandbox",
         "--virtual-time-budget=2500", "--window-size=%d,%d" % (w, h),
         "--user-data-dir=" + os.path.join(td, "ud"),
         "--dump-dom", "file:///" + tmp.replace("\\", "/") + "#layout=" + kind],
        capture_output=True, encoding="utf-8", errors="replace").stdout
    m = re.search(r"<title>(.*?)</title>", out, re.S)
    return m.group(1) if m else ""


def th_texts(dom):
    """传感器表的列头文本列表。"""
    m = re.search(r"<table[^>]*>(?:(?!</table>).)*?<thead>(.*?)</thead>", dom, re.S)
    if not m:
        return []
    return [re.sub(r"<[^>]*>", "", x).strip() for x in re.findall(r"<th[^>]*>(.*?)</th>", m.group(1), re.S)]


def hidden(tag):
    return re.search(r"display:\s*none", tag) is not None


def tag_of(dom, el_id):
    m = re.search(r'<[^>]*id="' + re.escape(el_id) + r'"[^>]*>', dom)
    return m.group(0) if m else ""


v2 = dump("v2")
xm1 = dump("xm1")

print("[1] 传感器表：两族都是 5 个列头，表头文本完全相同")
h2, h1 = th_texts(v2), th_texts(xm1)
want(len(h2) == 5, "4k 族 5 个列头", str(h2))
want(len(h1) == 5, "XM1 族 5 个列头", str(h1))
want(h2 == h1, "两族表头文本完全相同", "4k=%s / xm1=%s" % (h2, h1))

print("\n[2] 型号说明在右栏折叠卡里，不在 tbody 内")
for kind, dom in (("4k", v2), ("XM1", xm1)):
    want('id="sensorNoteBody"' in dom, "%s 有 #sensorNoteBody" % kind)
    tb = re.search(r'<tbody id="cpiRows">(.*?)</tbody>', dom, re.S)
    inner = tb.group(1) if tb else ""
    want('class="muted"' not in inner, "%s 的 cpiRows 内无 muted 说明行" % kind, inner[:80])

print("\n[3] 预设条只在 4k 族可见")
p2, p1 = tag_of(v2, "presetBar"), tag_of(xm1, "presetBar")
want(p2 != "" and not hidden(p2), "4k 族预设条可见", p2[:80])
want(p1 != "" and hidden(p1), "XM1 族预设条隐藏", p1[:80])

print("\n[4] 已删除的两个下拉不再出现在 DOM 里")
for kind, dom in (("4k", v2), ("XM1", xm1)):
    want('id="cpiLevels"' not in dom, "%s 无 #cpiLevels" % kind)
    want('id="cpiActive"' not in dom, "%s 无 #cpiActive" % kind)
want('id="grpSensorNote"' in v2 and 'id="grpSensorNote"' in xm1, "两族都有说明卡容器")

print("\n[5] 渲染完成")
for kind, dom in (("4k", v2), ("XM1", xm1)):
    want(len(dom) > 1000, "%s 渲染完成（DOM %d 字节）" % (kind, len(dom)))

print("\n[6] 六档分辨率下无纵向滚动")
# ★ 这项此前是**盲区**：render_check.py 只查横向滚动与文字截断，
#   纵向滚动没人查 —— 4k 族在 1366×768 上一直多出 34px（docH 663 vs 视口 629），
#   一直没人发现。四个族（4k 的「档位/LED 颜色/XY 独立」与 XM1 的
#   「档位/启用/当前」两套表头）使右栏高度不同，4k 那侧更挤。
RESOLUTIONS = [(1920, 1080), (1600, 900), (1440, 900), (1366, 768), (1280, 800), (1080, 900)]
for kind in ("v2", "xm1"):
    for w, h in RESOLUTIONS:
        dom = dump_probe(kind, w, h)
        m = re.search(r"docH=(\d+)/(\d+)", dom)
        want(bool(m) and m.group(1) == m.group(2),
             "%s %dx%d 无纵向滚动" % (kind, w, h),
             "docH=%s 视口=%s" % (m.group(1), m.group(2)) if m else "探针无返回")

print("\n结果：%d 项失败" % len(fails))
sys.exit(1 if fails else 0)
