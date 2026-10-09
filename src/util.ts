// 基础工具与全局诊断
const $ = (id: string): any => document.getElementById(id);
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
  const el = $("log");
  el.textContent += new Date().toLocaleTimeString() + "  " + msg + "\n";
  el.scrollTop = el.scrollHeight;
}
function banner(cls: string, text?: string) { const b = $("banner"); b.className = "banner " + cls; b.textContent = text || ""; }

export { $, sleep, hex, log, banner };
