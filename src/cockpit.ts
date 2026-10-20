/** 驾驶舱导航（A 方案）：左侧常驻设备栏，右侧一次只显示一个分区。
 *
 *  与 layout.ts 的分工是**刻意的单向依赖**：
 *    · layout 决定「这个型号有哪些卡片」（给卡片加 data-off 属性）
 *    · cockpit 决定「当前看哪一张」（给卡片加 data-active 属性）
 *  两者都不写 style.display，避免互相覆盖；CSS 统一裁决优先级。
 *
 *  降级：万一本模块没跑起来，stage 不带 .tabbed，所有卡片按原来的方式堆叠，
 *  功能一个不少 —— 布局增强不应该成为可用性的单点故障。
 */
import { t } from "./i18n.js";

/** 卡片 id → 导航文案的 i18n key（文案全部复用各卡片既有标题，不新增词条）。 */
const SECTIONS: Array<[string, string]> = [
  ["cardSensor", "secSensor"],
  ["cardPerf", "secPerf"],
  ["cardBtns", "secButtons"],
  ["cardTools", "secTools"],
  ["cardWeCpi", "secWeCpi"],
  ["cardWeBtns", "secWeBtns"],
  ["cardWeTools", "secWeTools"],
];

/** 当前布局下真正可用的分区（layout 已按型号裁剪）。 */
function sections(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const [id] of SECTIONS) {
    const el = document.getElementById(id);
    if (el && !el.hasAttribute("data-off")) out.push(el);
  }
  return out;
}

function activate(id: string) {
  const stage = document.getElementById("stage");
  if (!stage) return;
  const cards = sections();
  if (!cards.length) return;
  const target = cards.find((c) => c.id === id) ?? cards[0];
  for (const c of cards) c.toggleAttribute("data-active", c === target);

  for (const b of document.querySelectorAll<HTMLButtonElement>("#railNav [data-target]")) {
    b.toggleAttribute("data-active", b.dataset.target === target.id);
  }
}

/** 按当前布局重建左侧导航；切换设备类型、语言变化时都会被调用。 */
export function buildCockpit() {
  const nav = document.getElementById("railNav");
  const stage = document.getElementById("stage");
  if (!nav || !stage) return;

  const cards = sections();
  /* 记住当前分区：语言切换重建时不要跳回第一页。 */
  const previous = cards.find((c) => c.hasAttribute("data-active"));

  nav.innerHTML = "";
  cards.forEach((card, i) => {
    const key = SECTIONS.find(([id]) => id === card.id)?.[1] ?? "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "navItem";
    btn.dataset.target = card.id;
    btn.innerHTML =
      `<span class="navNo">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="navLabel">${t(key)}</span>`;
    btn.addEventListener("click", () => activate(card.id));
    nav.appendChild(btn);
  });

  const empty = document.getElementById("stageEmpty");
  if (empty) empty.toggleAttribute("hidden", cards.length > 0);

  /* 有分区才开 tab 模式；没有分区（第四族）就保持普通文档流，只显示提示。 */
  stage.classList.toggle("tabbed", cards.length > 0);
  if (cards.length) activate((previous ?? cards[0]).id);
}

document.addEventListener("layoutchange", buildCockpit);
