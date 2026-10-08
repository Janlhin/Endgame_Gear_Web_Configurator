/** 无头 DOM 桩：让「用到 DOM 的模块」能在 Node 里离线跑测试。
 *
 *  run_test.mjs 原本只测无 DOM 依赖的模块（protocol / xm2we / 报文构造），
 *  而这次要测的 presence.ts 依赖 render / layout / i18n —— 它们**在 import 期**就碰 DOM
 *  （util.ts 注册 window 错误监听、i18n.ts 给 #langSel 挂钩子、i18n.ts 读 navigator/locale）。
 *  所以这里给一份最小实现：够它们 import 通过，也够断言 resetToInitial 的界面清理。
 *
 *  ⚠️ 必须在被测模块**之前** import —— ESM 的求值顺序就是 import 声明顺序，
 *     而本文件的全部作用就是这个副作用。
 *  ⚠️ Node 22 自带只读的 globalThis.navigator，直接赋值会被静默忽略（严格模式下报错），
 *     因此用 defineProperty 覆盖。
 */

export const els: Record<string, any> = {};
export const listeners: Record<string, Function[]> = {};

function mkEl(id: string) {
  return {
    id, style: {} as any, dataset: {} as any,
    className: "", textContent: "", innerHTML: "", value: "",
    disabled: false, checked: false, scrollTop: 0, scrollHeight: 0, colSpan: 1,
    setAttribute() {}, removeAttribute() {}, appendChild() {}, prepend() {},
    insertAdjacentHTML() {}, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
}

/** 取（必要时新建）一个桩元素 —— 测试里也用它预置「上一台设备的残留」。 */
export function el(id: string) { return (els[id] ||= mkEl(id)); }

/** 触发一个 document 级事件（目前只用到 visibilitychange）。 */
export function fire(type: string) {
  for (const f of listeners[type] || []) f({ type });
}

/** 控制 navigator.hid.getDevices() 的返回值。null = 模拟「拿不到列表」（抛错）。 */
let devices: any[] | null = [];
export function setDevices(v: any[] | null) { devices = v; }

const w: any = globalThis;
w.window = {
  addEventListener(t: string, f: Function) { (listeners[t] ||= []).push(f); },
  matchMedia: () => ({ matches: false }),
  scrollTo() {},
};
w.document = {
  documentElement: { dataset: {}, lang: "" },
  visibilityState: "visible",
  addEventListener(t: string, f: Function) { (listeners[t] ||= []).push(f); },
  getElementById: (id: string) => el(id),
  querySelectorAll: () => [],
  createElement: () => mkEl("created"),
};
Object.defineProperty(w, "navigator", {
  configurable: true, writable: true,
  value: {
    languages: ["zh-CN"], language: "zh-CN",
    hid: {
      async getDevices() { if (devices === null) throw new Error("no device list"); return devices; },
    },
  },
});
Object.defineProperty(w, "localStorage", {
  configurable: true, writable: true,
  value: { getItem: () => null, setItem() {}, removeItem() {} },
});
