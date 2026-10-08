"""语言自动检测回归检查：用无头 Edge 以不同浏览器语言加载 index.html，
读回 <html lang> 与渲染出的标题文本，断言检测结果符合预期。
不连接任何设备，纯静态渲染验证。

用法：python re/i18n_check.py

模拟方式：Chromium 的 --accept-lang 会同时设置 navigator.language 与
navigator.languages（已实测：--accept-lang=en-US,en → "en-US" / ["en-US","en"]），
与真实用户在浏览器设置里改「语言」的等效。

⚠️ 未自动覆盖的一项（靠代码审查保证）：localStorage 里已有用户手动选择的值时
应优先于浏览器语言。无头环境下难以预置 file:// 的 localStorage，故不测。
"""
import re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = "file:///C:/Users/Janlhin/WorkBuddy/2026-10-08-19-20-54/xm2w-web/index.html"

ZH_TITLE = "网页版驱动"
EN_TITLE = "Web Configurator"

# (浏览器 accept-lang, 期望 LANG, 期望标题片段, 说明)
CASES = [
    ("zh-CN,zh",        "zh-CN", ZH_TITLE, "简体中文"),
    ("zh-TW",           "zh-CN", ZH_TITLE, "zh-TW 归到 zh-CN（唯一中文语言）"),
    ("zh-Hans-CN",      "zh-CN", ZH_TITLE, "zh-Hans-CN"),
    ("en-US,en",        "en",    EN_TITLE, "美式英语"),
    ("en-GB,en",        "en",    EN_TITLE, "英式英语"),
    ("en",              "en",    EN_TITLE, "裸 en"),
    ("fr-FR,en",        "en",    EN_TITLE, "法语不认识 → 取下一项 en"),
    ("fr-FR,de;q=0.8",  "zh-CN", ZH_TITLE, "全不认识 → 兜底 zh-CN"),
    ("ja-JP",           "zh-CN", ZH_TITLE, "日语 → 兜底"),
    ("",                "zh-CN", ZH_TITLE, "无偏好 → 兜底（本机系统即为 zh-CN）"),
]


def dump(accept_lang: str) -> str:
    args = [EDGE, "--headless=new", "--virtual-time-budget=2500", "--dump-dom"]
    if accept_lang:
        args.append("--accept-lang=" + accept_lang)
    args.append(BASE)
    return subprocess.run(args, capture_output=True, encoding="utf-8",
                          errors="replace").stdout


fails = 0
for accept, exp_lang, exp_title, why in CASES:
    dom = dump(accept)
    m_lang = re.search(r'<html[^>]*\blang="([^"]*)"', dom)
    got_lang = m_lang.group(1) if m_lang else "?"
    m_title = re.search(r'data-i18n="appTitle">([^<]*)<', dom)
    got_title = (m_title.group(1) if m_title else "?").strip()

    ok = (got_lang == exp_lang) and (exp_title in got_title)
    if not ok:
        fails += 1
    print("%-18s %s  lang=%-6s title=%-42s  (%s)"
          % (accept or "(none)", "OK  " if ok else "FAIL", got_lang, got_title, why))
    if not ok:
        print("                  期望 lang=%s title 含 %r" % (exp_lang, exp_title))

print("\n结果：%d 个用例，%d 个失败" % (len(CASES), fails))
sys.exit(1 if fails else 0)
