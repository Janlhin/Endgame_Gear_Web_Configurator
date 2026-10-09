// 基础工具与全局诊断

/** 按 id 取元素，返回 `T | null`。
 *
 *  为什么收敛（此前是 `any`）：`$` 是全项目 121 处 DOM 调用的类型源头，
 *  它返回 any 就等于给所有 DOM 操作关掉了类型通道——
 *  `$("btnSave").随便写` 都不会报错。实测收敛为 `HTMLElement | null`
 *  会暴露 191 个类型错误（83 处空值假设 + 46 处元素类型不对）。
 *
 *  两种用法：
 *    $("banner")                  → HTMLElement | null（默认，纯展示元素）
 *    $<HTMLSelectElement>("sel")   → HTMLSelectElement | null（显式声明期望类型）
 *
 *  ⚠️ **T 的第二个类型参数只做编译期断言，不做运行时校验**：
 *  id 写错或类型不符时，运行时照样抛。这是取舍——运行时校验要在每个
 *  调用点多写一次，而 element id 写错在开发时立刻就会暴露。
 *
 *  ⚠️ **改动这个签名前先读 TASKS.md 的 T-112**：121 个调用点里
 *  大量依赖原先 any 隐含的「不会为空」假设，需逐个补空值处理。
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

/** 同 $，但**断言元素必然存在**，省掉 `!` 后缀。
 *
 *  ⚠️ **只在元素写死在静态 HTML 里时使用。**判据：
 *  该id 能在这个仓库的 index.html 里 grep 到。
 *  写成 `id="..."` 的元素随页面一同解析，加载完就一直在——
 *  对这类元素判空是多余的噪音（一百多处 `if (el)` 挡着一个永不成立的条件）。
 *
 *  **动态插入的元素（innerHTML 拼出来的 tr/td/input 等）必须用 $ +判空**，
 *  它们在调用时才存在。分不清时用 $，让tsc 提醒你。
 */
const $el = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const hex = (arr: any, n: number): string => Array.from(arr.slice(0, n) as Uint8Array, (b: number) => b.toString(16).padStart(2, "0")).join(" ");

/* 全局错误捕获：任何初始化异常都直接显示，避免“点了没反应” */
window.addEventListener("error", e => {
  try {
    const b = $("banner");
    if (b) { b.className = "banner err"; b.textContent = "脚本错误: " + e.message + " @" + e.lineno; }
  } catch (_) {}
});
window.addEventListener("unhandledrejection", e => {
  try { log("✗ promise: " + (e.reason && e.reason.message || e.reason)); } catch (_) {}
});


function log(msg: string) {
  const el = $el("log");
  el.textContent += new Date().toLocaleTimeString() + "  " + msg + "\n";
  el.scrollTop = el.scrollHeight;
}
function banner(cls: string, text?: string) { const b = $el("banner"); b.className = "banner " + cls; b.textContent = text || ""; }

export { $, $el, sleep, hex, log, banner };
