"""布局裁剪回归检查：无头加载 index.html 的 #layout=xxx 预览，读回各卡片/行的可见性。
不连接任何设备，纯静态渲染验证。
用法：python re/layout_check.py
"""
import io, re, subprocess, sys

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = "file:///C:/Users/Janlhin/WorkBuddy/2026-10-08-19-20-54/xm2w-web/index.html"

# 期望：每类布局下应可见的卡片 / 行（与 src/layout.ts 的 LAYOUT 对应）
CARDS_4K = ["cardInfo", "cardSensor", "cardPerf", "cardBtns", "cardTools"]
EXPECT = {
    "(none)": {"cards": [], "rows": []},
    "v1": {"cards": CARDS_4K,
           "rows": ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellAngleSnap",
                    "cellRipple", "cellLedLiftoff", "rowPolling", "rowMotionSync",
                    "rowSlamclick", "rowV1Jitter", "rowPower", "rowPairing"]},
    "v2": {"cards": CARDS_4K,
           "rows": ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellGlass",
                    "cellAngleSnap", "cellRipple", "cellLedLiftoff", "rowAngleTune",
                    "rowPolling", "rowMotionSync", "rowSlamclick", "rowV2Max",
                    "rowV2Multi", "rowPower", "rowPairing"]},
    "xm1": {"cards": ["cardInfo", "cardSensor", "cardTools"], "rows": ["rowLod", "cellRipple"]},
    "ro": {"cards": ["cardInfo", "cardSensor", "cardTools"],
           "rows": ["rowDongleFw", "rowBattery", "cellAngleSnap", "cellRipple"]},
    "we": {"cards": ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"], "rows": []},
}
ALL_CARDS = CARDS_4K + ["cardWeInfo", "cardWeCpi", "cardWeBtns", "cardWeTools"]
ALL_ROWS = ["rowDongleFw", "rowBattery", "rowStages", "rowLod", "cellGlass", "cellAngleSnap", "cellRipple",
            "cellLedLiftoff", "rowAngleTune", "rowPolling", "rowMotionSync", "rowSlamclick",
            "rowV1Jitter", "rowV2Max", "rowV2Multi", "rowPower", "rowPairing"]


def hidden(tag: str) -> bool:
    """标签属性里是否含 display:none（DOM 序列化可能是 'display: none;'）。"""
    return re.search(r'display:\s*none', tag) is not None


def dump(kind: str) -> str:
    url = BASE + ("" if kind == "(none)" else "#layout=" + kind)
    return subprocess.run([EDGE, "--headless=new", "--virtual-time-budget=2500", "--dump-dom", url],
                          capture_output=True, encoding="utf-8", errors="replace").stdout


def visible(dom: str, ids, tag_name: str):
    out = []
    for i in ids:
        m = re.search(r'<' + tag_name + r'[^>]*id="' + i + r'"[^>]*>', dom)
        if not m:
            out.append("?" + i)          # 元素缺失
        elif not hidden(m.group(0)):
            out.append(i)
    return out


fails = 0
for kind, exp in EXPECT.items():
    dom = dump(kind)
    got_cards = [c for c in visible(dom, ALL_CARDS, "section")]
    got_rows = visible(dom, ALL_ROWS, "(?:div|span)")
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
