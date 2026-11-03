/** 构建指纹 —— **必须保持这个字面量原样**。
 *
 *  build.mjs 在打包后用字符串替换把它换成「<commit> · <UTC 时间>」。
 *  出现位置：页面页脚（截图即可核对）+ 诊断 JSON 的 meta.build。
 *
 *  起因见 issue #1：志愿者与维护者无法确认「你测的是哪一版」——
 *  Pages 有 10 分钟缓存，且本地打补丁的页面与线上产物无从区分。
 */
export const BUILD_STAMP = "__BUILD_STAMP__";
