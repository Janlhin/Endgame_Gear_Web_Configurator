/** 错误对象的**收窄**助手（无任何 DOM 依赖）。
 *
 *  存在的原因：开启 `strict` 后 `catch (e)` 的 e 是 unknown，直接读 e.message 会报错。
 *  两种补法是 `catch (e: any)` 或 `(e as any).message` —— 那等于把刚打开的类型通道又关掉。
 *  这里选择收窄，并**单独成文件**：util.ts 有 window 级副作用，而协议层模块
 *  （xm2we.ts 等）必须能在无 DOM 环境（Node 测试）里被 import。 */

/** strict 下 `catch (e)` 的 e 是 unknown。这里做**收窄**而不是 `as any` ——
 *  用 any 等于把刚打开的类型校验通道又关掉，等于白开。 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}

/** transport.ts 的 StatusError 带 code；同样的收窄口径。 */
export function errCode(e: unknown): number | undefined {
  if (e && typeof e === "object") {
    const c = (e as { code?: unknown }).code;
    if (typeof c === "number") return c;
  }
  return undefined;
}
