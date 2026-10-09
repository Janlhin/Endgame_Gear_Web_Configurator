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
import os, re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
# 仓库根按脚本位置推导 —— 目录改名后不必再改这里（2026-10-09 踩过：写死路径导致四个检查同时失效）
BASE = "file:///" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html")).replace(os.sep, "/")

# 各语言 appTitle 里的判别片段（相互之间不能有包含关系）
T = {
    "zh-CN": "网页版配置器",
    "zh-TW": "網頁版配置器",
    "en": "Web Configurator",
    "de": "Web-Konfigurator",
    "fr": "Configurateur web",
    "es": "Configurador web",
    "ja": "コンフィギュレーター",
    "ko": "웹 구성 도구",
}

# (浏览器 accept-lang, 期望 LANG, 说明)
CASES = [
    ("zh-CN,zh",         "zh-CN", "简体中文"),
    ("zh-Hans-CN",       "zh-CN", "zh-Hans-CN 归到简体"),
    ("zh",               "zh-CN", "裸 zh"),
    ("zh-TW",            "zh-TW", "繁体（台湾）"),
    ("zh-HK",            "zh-TW", "繁体（香港）"),
    ("zh-Hant",          "zh-TW", "zh-Hant"),
    ("zh-Hant-TW",       "zh-TW", "zh-Hant-TW"),
    ("en-US,en",         "en",    "美式英语"),
    ("en-GB,en",         "en",    "英式英语"),
    ("en",               "en",    "裸 en"),
    ("de-DE,de",         "de",    "德语"),
    ("de-AT",            "de",    "奥地利德语"),
    ("fr-FR,fr",         "fr",    "法语"),
    ("fr-CA",            "fr",    "加拿大法语"),
    ("es-ES,es",         "es",    "西班牙语"),
    ("es-419",           "es",    "拉美西班牙语"),
    ("ja-JP,ja",         "ja",    "日语"),
    ("ko-KR,ko",         "ko",    "韩语"),
    ("it-IT,en",         "en",    "意大利语不支持 → 取下一项 en"),
    ("it-IT,de;q=0.8",   "de",    "意大利语不支持 → 取下一项 de"),
    ("it-IT,ru",         "zh-CN", "全不认识 → 兜底 zh-CN"),
    ("",                 "zh-CN", "无偏好 → 兜底（本机系统即为 zh-CN）"),
]

# 每种语言的字体栈规则必须编译进产物（简体走默认栈，不单独给规则）
FONT_RULES = {"zh-TW": "html:lang(zh-TW)", "ja": "html:lang(ja)", "ko": "html:lang(ko)"}


def dump(accept_lang: str) -> str:
    args = [EDGE, "--headless=new", "--virtual-time-budget=2500", "--dump-dom"]
    if accept_lang:
        args.append("--accept-lang=" + accept_lang)
    args.append(BASE)
    return subprocess.run(args, capture_output=True, encoding="utf-8",
                          errors="replace").stdout


fails = 0
last_dom = ""
for accept, exp_lang, why in CASES:
    dom = dump(accept)
    last_dom = dom
    m_lang = re.search(r'<html[^>]*\blang="([^"]*)"', dom)
    got_lang = m_lang.group(1) if m_lang else "?"
    m_title = re.search(r'data-i18n="appTitle">([^<]*)<', dom)
    got_title = (m_title.group(1) if m_title else "?").strip()

    ok = (got_lang == exp_lang) and (T[exp_lang] in got_title)
    if not ok:
        fails += 1
    print("%-18s %s  lang=%-6s title=%-46s  (%s)"
          % (accept or "(none)", "OK  " if ok else "FAIL", got_lang, got_title, why))
    if not ok:
        print("                  期望 lang=%s title 含 %r" % (exp_lang, T[exp_lang]))

# 字体栈规则存在性
print()
for lang, rule in FONT_RULES.items():
    ok = rule in last_dom
    if not ok:
        fails += 1
    print("字体规则 %-18s %s" % (rule, "OK" if ok else "FAIL（未出现在产物里）"))

print("\n结果：%d 个语言检测用例 + %d 条字体规则，%d 项失败"
      % (len(CASES), len(FONT_RULES), fails))
sys.exit(1 if fails else 0)
