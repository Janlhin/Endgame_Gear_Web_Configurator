"""布局裁剪回归检查：无头加载 index.html 的 #layout=xxx 预览，读回各卡片/行的**归属**。
不连接任何设备，纯静态渲染验证。
用法：python re/layout_check.py

★ 2026-10-20 更新：卡片不再用内联 style.display，而是用 data-off 属性
  （layout.ts 决定「这个型号有没有这张卡」，cockpit.ts 决定「当前看哪一张」，
   两者都写 style.display 会互相覆盖）。
  因此：
    · 卡片的判据从「内联 display:none」改为「带 data-off 属性」
    · 卡片在 stage 里是**一次只显示一张**（data-active），本检查只关心归属，不关心当前显示哪张
    · 行仍然是内联 style.display，判据不变
"""
import io, os, re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
# 仓库根按脚本位置推导 —— 目录改名后不必再改这里（2026-10-09 踩过：写死路径导致四个检查同时失效）
BASE = "file:///" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html")).replace(os.sep, "/")

# 期望：每类布局下应归属的卡片 / 行（与 src/layout.ts 的 LAYOUT 对应）
CARDS_4K = ["cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools"]
EXPECT = {
    "(none)": {"cards": [], "rows": []},
    "v1": {"cards": CARDS_4K,
           "rows": ["rowDongleFw", "rowBattery", "grpSensorNote", "presetBar", "rowLod", "cellAngleSnap",
                    "cellRipple", "cellLedLiftoff", "rowPolling", "rowMotionSync",
                    "rowSlamclick", "rowV1Jitter", "rowPower", "rowPairing"]},
    "v2": {"cards": CARDS_4K,
           "rows": ["rowDongleFw", "rowBattery", "grpSensorNote", "presetBar", "rowLod", "cellGlass",
                    "cellAngleSnap", "cellRipple", "cellLedLiftoff", "rowAngleTune",
                    "rowPolling", "rowMotionSync", "rowSlamclick", "rowV2Max",
                    "rowV2Multi", "rowPower", "rowPairing"]},
    "xm1": {"cards": ["cardInfo", "cardSensor", "cardTools"],
            "rows": ["grpSensorNote", "rowLod", "cellRipple"]},
    "ro": {"cards": ["cardInfo", "cardSensor", "cardTools"],
           "rows": ["rowDongleFw", "rowBattery", "grpSensorNote", "presetBar", "cellAngleSnap", "cellRipple"]},
    "8k": {"cards": ["cardInfo", "cardSensor", "cardPerf", "cardTools"],
           "rows": ["grpSensorNote", "presetBar", "cellAngleSnap", "cellRipple", "rowPolling",
                    "rowMotionSync", "rowSlamclick", "rowV1Jitter"]},
    "unsupported": {"cards": ["cardInfo"], "rows": []},
    "we": {"cards": ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"], "rows": []},
}
ALL_CARDS = CARDS_4K + ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"]
ALL_ROWS = ["rowDongleFw", "rowBattery", "grpSensorNote", "presetBar", "rowLod", "cellGlass",
            "cellAngleSnap", "cellRipple", "cellLedLiftoff", "rowAngleTune", "rowPolling",
            "rowMotionSync", "rowSlamclick", "rowV1Jitter", "rowV2Max", "rowV2Multi",
            "rowPower", "rowPairing"]


def hidden(tag: str) -> bool:
    """标签属性里是否含 display:none（DOM 序列化可能是 'display: none;'）。"""
    return re.search(r'display:\s*none', tag) is not None


def is_off(tag: str) -> bool:
    """元素是否带 data-off 属性（= 该型号没有这张卡）。"""
    return re.search(r'\bdata-off\b', tag) is not None


def dump(kind: str) -> str:
    url = BASE + ("" if kind == "(none)" else "#layout=" + kind)
    return subprocess.run([EDGE, "--headless=new", "--virtual-time-budget=2500", "--dump-dom", url],
                          capture_output=True, encoding="utf-8", errors="replace").stdout


def owned(dom: str, ids, tag_name: str, card: bool):
    """返回「归属该布局」的元素 id 列表。card=True 用 data-off 判据，否则用内联 display。"""
    out = []
    for i in ids:
        m = re.search(r'<' + tag_name + r'[^>]*id="' + i + r'"[^>]*>', dom)
        if not m:
            out.append("?" + i)          # 元素缺失
            continue
        tag = m.group(0)
        gone = is_off(tag) if card else hidden(tag)
        if not gone:
            out.append(i)
    return out


fails = 0
for kind, exp in EXPECT.items():
    dom = dump(kind)
    got_cards = owned(dom, ALL_CARDS, "section", card=True)
    got_rows = owned(dom, ALL_ROWS, "(?:div|span)", card=False)
    exp_cards, exp_rows = sorted(exp["cards"]), sorted(exp["rows"])
    ok_c = sorted(got_cards) == exp_cards
    ok_r = sorted(got_rows) == exp_rows
    if not (ok_c and ok_r):
        fails += 1
    print("%-7s %s" % (kind, "OK" if ok_c and ok_r else "FAIL"))
    print("   卡片 可见: %s" % (" ".join(got_cards) or "(无)"))
    if not ok_c:
        print("        期望: %s" % (" ".join(exp_cards) or "(无)"))
    print("   行   可见: %s" % (" ".join(got_rows) or "(无)"))
    if not ok_r:
        print("        期望: %s" % (" ".join(exp_rows) or "(无)"))

print()
print("结果：%d 类布局，%d 类失败" % (len(EXPECT), fails))
sys.exit(1 if fails else 0)
