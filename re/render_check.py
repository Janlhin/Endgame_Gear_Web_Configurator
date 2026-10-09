"""逐语言渲染检查：无头 Edge 以每种语言加载 index.html（#layout=v2 预览，
界面最满的布局），注入探针检测三件事：

  1. HSCROLL  页面是否出现横向滚动（documentElement.scrollWidth > innerWidth）
  2. CLIP     元素内容是否被截断（scrollWidth > clientWidth）—— 按钮/标签文字放不下
  3. FONT     body 的实际字体栈首项是否符合该语言的约定（日/韩/繁体要换 CJK 字体）

不连接设备，不修改项目文件 —— 探针注入到 <b>临时副本</b> 里。

用法：python re/render_check.py
"""
import os, re, subprocess, sys, tempfile

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
# 仓库根按脚本位置推导 —— 目录改名后不必再改这里（2026-10-09 踩过：写死路径导致四个检查同时失效）
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

PROBE = """
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var de = document.documentElement;
    var hscroll = de.scrollWidth > window.innerWidth;
    var clipped = [];
    document.querySelectorAll('body *').forEach(function (el) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.offsetParent === null && cs.position !== 'fixed') return;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        var label = (el.textContent || '').trim().slice(0, 20);
        clipped.push((el.id || el.className || el.tagName) + '(' + el.scrollWidth + '>' + el.clientWidth + ')' + label);
      }
    });
    var fam = (getComputedStyle(document.body).fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
    document.title = 'PROBE ' + (hscroll ? 'HSCROLL' : 'ok')
      + ' ' + de.scrollWidth + '/' + window.innerWidth
      + ' || ' + (clipped.length ? clipped.slice(0, 6).join(' ; ') : 'no-clip')
      + ' || font:' + fam;
  }, 700);
});
</script>
"""

tmpdir = tempfile.mkdtemp(prefix="egg-render-")
html = open(SRC, encoding="utf-8").read()
assert "</body>" in html, "index.html 没有 </body>"
probe_path = os.path.join(tmpdir, "probe.html")
open(probe_path, "w", encoding="utf-8").write(html.replace("</body>", PROBE + "</body>", 1))
URL = "file:///" + probe_path.replace("\\", "/") + "#layout=v2"

# 语言 → (accept-lang, 期望的字体栈首项)
EXPECT = {
    "zh-CN": ("zh-CN,zh", "Segoe UI"),
    "zh-TW": ("zh-TW",    "Microsoft JhengHei"),   # 微軟正黑體，别落到简体字形
    "en":    ("en-US,en", "Segoe UI"),
    "de":    ("de-DE,de", "Segoe UI"),
    "fr":    ("fr-FR,fr", "Segoe UI"),
    "es":    ("es-ES,es", "Segoe UI"),
    "ja":    ("ja-JP,ja", "Yu Gothic UI"),         # 否则日文汉字会套简体字形
    "ko":    ("ko-KR,ko", "Malgun Gothic"),
}

fails = 0
for lang, (accept, want_font) in EXPECT.items():
    r = subprocess.run([EDGE, "--headless=new", "--accept-lang=" + accept,
                        "--virtual-time-budget=4000", "--window-size=1100,900", "--dump-dom", URL],
                       capture_output=True, encoding="utf-8", errors="replace")
    m = re.search(r"<title>(PROBE[^<]*)</title>", r.stdout)
    if not m:
        print("%-6s FAIL  探针没有回写结果（页面可能没加载完）" % lang)
        fails += 1
        continue
    out = m.group(1)
    got_font = (re.search(r"font:(.*)$", out) or [None, "?"])[1]
    ok = ("HSCROLL" not in out) and ("no-clip" in out) and (got_font == want_font)
    if not ok:
        fails += 1
    print("%-6s %s  %s" % (lang, "FAIL" if ok is False else "OK  ", out[6:]))
    if got_font != want_font:
        print("        期望字体 %r，实际 %r" % (want_font, got_font))

print("\n结果：%d 种语言，%d 种渲染有问题" % (len(EXPECT), fails))
sys.exit(1 if fails else 0)
