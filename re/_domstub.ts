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
  const el: any = {
    id, style: {} as any, dataset: {} as any,
    className: "", textContent: "",
    disabled: false, checked: false, scrollTop: 0, scrollHeight: 0, colSpan: 1,
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    removeAttribute(k: string) { delete this.attrs[k]; },
    toggleAttribute(k: string, force?: boolean) {
      const on = force === undefined ? !(k in this.attrs) : !!force;
      if (on) this.attrs[k] = ""; else delete this.attrs[k];
      return on;
    },
    hasAttribute(k: string) { return k in this.attrs; },
    getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; },
    attrs: {} as Record<string, string>,
    children: [] as any[],
    tagName: "DIV",
    /* <select> 的 options 列表：value 赋值时若能匹配上就选中，
       否则保持空（与浏览器一致：没有匹配项就显示空白）。 */
    options: [] as any[],
    _value: "",
    get value() { return this._value; },
    set value(v: string) {
      this._value = String(v);
      if (this.tagName === "SELECT" && this.options.length &&
          !this.options.some((o: any) => o.value === this._value)) {
        this._value = "";   // 与浏览器一致：没有匹配项则不选中
      }
    },
    /* classList：paintBattery 等处对 SVG 元素做 classList.toggle。 */
    classList: {
      _set: new Set<string>(),
      add(c: string) { this._set.add(c); },
      remove(c: string) { this._set.delete(c); },
      contains(c: string) { return this._set.has(c); },
      toggle(c: string, force?: boolean) {
        const on = force === undefined ? !this._set.has(c) : !!force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
    },
    /* innerHTML 赋值时同步解析出 td/th 子元素 —— 渲染层用 innerHTML 建行，
       断言层要读行里的格子。只需支持 <td>...</td> 与 <th>...</th>。 */
    set innerHTML(v: string) {
      this._html = v;
      this.children = [];
      /* 只解析真正需要断言的结构：td/th 单元格，
         以及单元格里的 input/select（表格行断言要读到它们的 checked / dataset）。 */
      const re2 = /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(v))) {
        const c = mkEl("cell");
        c.tagName = m2[1].toUpperCase();
        const cm = m2[2].match(/class="([^"]*)"/);
        if (cm) c.className = cm[1];
        c.textContent = m2[3].replace(/<[^>]*>/g, "");
        /* 先赋 innerHTML（它会重置 children），再把 input 收进来。 */
        c.innerHTML = m2[3];
        const re3 = /<(input|select)([^>]*)>/g;
        let m3: RegExpExecArray | null;
        while ((m3 = re3.exec(m2[3]))) {
          const inp = mkEl("cell");
          inp.tagName = m3[1].toUpperCase();
          const attrs = m3[2];
          const dm = attrs.match(/data-([\w-]+)="([^"]*)"/);
          if (dm) inp.dataset[dm[1]] = dm[2];
          if (/\bchecked\b/.test(attrs)) inp.checked = true;
          if (/\bdisabled\b/.test(attrs)) inp.disabled = true;
          const vm = attrs.match(/value="([^"]*)"/);
          if (vm) inp.value = vm[1];
          c.children.push(inp);
        }
        this.children.push(c);
      }
    },    get innerHTML() { return this._html ?? ""; },
    appendChild(c: any) {
      this.children.push(c);
      if (this.tagName === "SELECT" && c && c.tagName === "OPTION") this.options.push(c);
      return c;
    },
    prepend() {},
    insertAdjacentHTML() {}, addEventListener() {},
    querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; },
    /* 只支持本仓库实际用到的两种选择器：标签名 与 [attr] / [attr="v"]。 */
    querySelectorAll(sel: string) {
      /* 支持三种写法：标签名 / [attr] / [attr="v"] / 标签[attr]（如 input[data-on]）。 */
      const m = sel.match(/^([A-Za-z]*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
      if (!m) return [];
      const [, tag, attr, attrVal] = m;
      const out: any[] = [];
      /* 递归：表格行里的 input 嵌在 td 内，渲染代码用 tb.querySelectorAll
         找的是**后代**，不是直接子元素。 */
      const walk = (nodes: any[]) => {
        for (const c of nodes) {
          /* ⚠️ 递归不能被「标签不匹配」跳过 —— 否则 <tr> 里的 <td> 永远走不到。 */
          const tagOk = !tag || c.tagName === tag.toUpperCase();
          if (tagOk) {
            if (attr) {
              /* ★ dataset 的键是 data-on → on，但选择器写的是属性名 data-on。
                 浏览器按属性名匹配，这里要先把 data- 前缀剥掉。 */
              const key = attr.startsWith("data-") ? attr.slice(5) : attr;
              const actual = c.dataset ? c.dataset[key] : undefined;
              if (attrVal === undefined ? actual !== undefined : String(actual) === attrVal) out.push(c);
            } else out.push(c);
          }
          if (c.children) walk(c.children);
        }
      };
      walk(this.children);
      return out;
    },
  };
  return el;
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
  dispatchEvent(e: any) {
    for (const f of listeners[e?.type] || []) f(e);
    return true;
  },
  getElementById: (id: string) => el(id),
  querySelectorAll: () => [],
  createElement: (tag: string) => { const e = mkEl("created"); e.tagName = String(tag).toUpperCase(); return e; },
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
