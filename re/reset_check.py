"""设备丢失 → 自动回到初始界面：端到端无头检查。

用 `#layout=xxx&simulate=lost` 先套上某个型号的布局，让页面处于「已连接某型号」的样子，
再触发真实的 resetToInitial()（#simulate= 钩子调的就是它），
断言界面确实回到「未连接」初始态：卡片全收起 / 状态胶囊 / 横幅 / 数据行清空 / 按钮禁用。

对照组 = 不带 simulate 的 `#layout=v2`：卡片必须**保持可见** ——
证明上面的复位是 simulate 触发的，而不是页面一加载就无条件复位了（否则本检查会假通过）。

不连接任何设备。
用法：python re/reset_check.py
"""
import os, re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
# 仓库根按脚本位置推导 —— 目录改名后不必再改这里（2026-10-09 踩过：写死路径导致四个检查同时失效）
BASE = "file:///" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html")).replace(os.sep, "/")

CARDS_4K = ["cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools"]
ALL_CARDS = CARDS_4K + ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"]
ALL_ROWS = ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellGlass", "cellAngleSnap",
            "cellRipple", "cellLedLiftoff", "rowAngleTune", "rowPolling", "rowMotionSync",
            "rowSlamclick", "rowV1Jitter", "rowV2Max", "rowV2Multi", "rowPower", "rowPairing"]
# filterRows 已随「按键卡两张表合并为一张」从 DOM 移除（#cardBtns 只剩 btnRows）。
EMPTY_BODIES = ["cpiRows", "btnRows", "weCpiRows", "weBtnRows"]

# 每种布局都演练一遍：#layout= 先铺开，simulate=lost 再复位
CASES = ["v1", "v2", "xm1", "ro", "8k", "unsupported", "we"]


def dump(hash_: str) -> str:
    url = BASE + hash_
    return subprocess.run([EDGE, "--headless=new", "--accept-lang=zh-CN,zh",
                           "--virtual-time-budget=2500", "--dump-dom", url],
                          capture_output=True, encoding="utf-8", errors="replace").stdout


def tag(dom: str, el_id: str, name: str = r"(?:section|div|span|button|tbody|input)") -> str:
    """取某个 id 元素的起始标签（属性都在里面）。"""
    m = re.search(r"<" + name + r"[^>]*id=\"" + el_id + r"\"[^>]*>", dom)
    return m.group(0) if m else ""


def text(dom: str, el_id: str) -> str:
    m = re.search(r"id=\"" + el_id + r"\"[^>]*>([^<]*)<", dom)
    return (m.group(1) if m else "").strip()


def hidden(dom: str, el_id: str) -> bool:
    """行：仍是内联 style.display。"""
    return re.search(r"display:\s*none", tag(dom, el_id)) is not None


def card_off(dom: str, el_id: str) -> bool:
    """卡片：改用 data-off 属性表示「该型号没有这张卡」（2026-10-20 起，
    卡片显隐由 layout.ts / cockpit.ts 用属性裁决，不再写内联 display）。"""
    return re.search(r"\bdata-off\b", tag(dom, el_id)) is not None


fails = 0
print("演练「设备丢失 → 复位到初始界面」：")
for kind in CASES:
    dom = dump("#layout=%s&simulate=lost" % kind)
    shown = [c for c in ALL_CARDS if not card_off(dom, c)]
    rows = [r for r in ALL_ROWS if not hidden(dom, r)]
    leftover = [i for i in EMPTY_BODIES if not re.search(r"id=\"" + i + r"\"[^>]*>\s*</", dom)]
    conn = tag(dom, "connState")
    banner = tag(dom, "banner")
    checks = [
        ("卡片全收起", not shown, "仍可见: " + " ".join(shown)),
        ("行全收起", not rows, "仍可见: " + " ".join(rows)),
        ("状态胶囊未连接", "off" in conn and text(dom, "connState") == "未连接",
         "class=%s text=%s" % (conn, text(dom, "connState"))),
        ("横幅 err + 回到初始界面", "banner err" in banner and "初始界面" in text(dom, "banner"),
         "tag=%s text=%s" % (banner, text(dom, "banner"))),
        ("重新读取按钮禁用", "disabled" in tag(dom, "btnRefresh", "button"), ""),
        ("设备信息已清空", text(dom, "iModel") == "—", "iModel=" + text(dom, "iModel")),
        ("数据行已清空", not leftover, "非空: " + " ".join(leftover)),
    ]
    bad = [c for c in checks if not c[1]]
    fails += len(bad)
    print("  %-12s %s" % (kind, "OK" if not bad else "FAIL"))
    for name, _, extra in bad:
        print("         ✗ %s  %s" % (name, extra))

# 对照组：不带 simulate 时布局必须保持 —— 否则上面的断言全是假通过
# ⚠️ 判据只能看 banner 的**标签**：产物 JS 里有一行 `b.className="banner err"`
#    （util.ts 的全局错误处理），拿整份 DOM 去 grep 会假命中。
print("\n对照（#layout=v2，不带 simulate）：布局应保持")
dom = dump("#layout=v2")
ctrl = ([c for c in CARDS_4K if not card_off(dom, c)] == CARDS_4K
        and "err" not in tag(dom, "banner"))
if not ctrl:
    fails += 1
print("  %-12s %s" % ("v2 保持", "OK" if ctrl else "FAIL"))

print("\n结果：%d 例演练 + 1 例对照，%d 项失败" % (len(CASES), fails))
sys.exit(1 if fails else 0)
