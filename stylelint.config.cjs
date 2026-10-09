// Stylelint 配置。
//
// ⚠️ **必须是 CommonJS（.cjs）**，不能用 ESM。
// 实测：Stylelint 17 用 `require()` + cosmiconfig 加载配置，
// 对 `export default` 的 .mjs 配置报 `SyntaxError: Unexpected string`
// （栈里有 loadESMFromCJS）。ESLint 的 flat config 能用 .mjs，Stylelint 不能。
//
// ⚠️ **Stylelint 17 移除了 15 个 stylistic 规则**（排版类），
// 它们搬到了 `@stylistic/stylelint-plugin`。因此下面**不能**写：
//   number-leading-zero / string-quotes / indentation /
//   no-eol-whitespace / color-hex-case
// 写了会报 `Unknown rule`。核对的命令：
//   ls node_modules/stylelint/lib/rules/ | grep <规则名>
// 若将来要为排版立门禁，先 `npm i -D @stylistic/stylelint-plugin`。
//
// 【为什么需要】—— 主规范要求「样式层有 lint，且不得有硬编码色值」。
// 本项目已有完整的设计令牌体系（scss/_tokens.scss，42 个颜色集中于此，
// 通过 CSS 自定义属性暴露），且**业务样式里的硬编码色值已是 0**
// （main.scss / studio.scss / _mixins.scss 各 0 处）。
// 所以本配置的任务不是「清理存量」，而是**把这份成果锁死**——
// 防止以后有人为图方便在业务样式里直接写 #2563eb，
// 那样主题切换会失效（令牌是通过 var(--c-*) 暴露的，见 _tokens.scss 头部）。

module.exports = {
  // SCSS 语法：Stylelint 默认按 CSS 解析，会在 `//` 注释与 `$变量` 处报
  // `Unknown word //  CssSyntaxError`。缺这一行整个项目都过不了。
  customSyntax: "postcss-scss",

  // 只检查 scss 目录：产物 index.html 里是编译后的 CSS，
  // 那里全是 var() 展开后的字面量，不该参与检查。
  files: ["scss/**/*.scss"],

  rules: {
    // ---- 核心：业务样式禁止颜色字面量 ----
    // 注意是**数组形式**：外层数组里放「属性名, [禁用值...]」的二元组。
    // 写成对象或裸字符串都会报 Invalid option。
    "declaration-property-value-disallowed-list": {
      // ★★格式说明（我在这上面绕了很久，源码是唯一依据）★★
      // 读 lib/rules/declaration-property-value-disallowed-list/index.mjs：
      //   const propPatterns = propKeys.filter(key => matchesStringOrRegExp(prop, key));
      //   → **键匹配的是属性名**（decl.prop），不是颜色。
      //   optionsMatches(primary, pattern, value) → **值列表匹配的是属性值**。
      //
      // 所以正确写法是键放「任意属性名」、值放「要禁的颜色」：
      //   {"/.+/": ["/^#/"]}
      //   键 "/.+/"  = 任何属性名（斜杠是 RegExp 字面量标记，Stylelint 约定）
      //   值 "/^#/"  = 以 # 开头的 hex 色
      //
      // ⚠️ 我曾写成 {"/^#/": [...]}（把颜色正则当成属性名）——
      //   配置能通过校验、不报任何错，但**一条也拦不住**。
      //   这种「配置合法但规则失效」的状态最危险，故 T-104 的完成判据
      //   要求必须实测注入一个字面量颜色，确认真的会被拦。
      "/.+/": ["/^#/", "/\\b(rgb|rgba|hsl|hsla)\\(/i"],
    },

    // ---- 颜色正确性（不是排版，17 里仍保留） ----
    "color-no-invalid-hex": true, // 抓 #fffff 这类笔误
    "color-hex-length": "short", // #ffffff → #fff，能缩短产物

    // ---- 语义正确性（这些才是真正值得拦的） ----
    // 同一个声明块里重复写同一个属性：后者覆盖前者，通常是复制粘贴留下的隐患
    "declaration-block-no-duplicate-properties": true,
    // 简写与长写混用：margin: 1px 1px 1px 1px 冗余
    "declaration-block-no-shorthand-property-overrides": true,
    "no-duplicate-selectors": true, // 同选择器写两遍，合并即可
    "block-no-empty": true, // 空规则块
    // 注释前留空行，可读性
    "comment-empty-line-before": ["always", { except: ["first-nested"], ignore: ["stylelint-commands"] }],
    // 选择器不该带元素名（.a.button → .button），特异性更难控制
    "selector-no-qualifying-type": null, // 本项目大量用 .card .row 这类，保持现状
    // 降序特异性：后写的选择器权重更低容易失效
    "no-descending-specificity": null, // SCSS 嵌套编译后顺序特殊，暂不启用
  },

  overrides: [
    {
      // ★ 令牌表是颜色的唯一真值来源，字面量必须允许 ——
      // 它把颜色集中在这里、暴露成 CSS 自定义属性供 JS 读取，
      // 主题切换只改 <html> 的 data-theme，组件样式一行不用改。
      files: ["scss/_tokens.scss"],
      rules: {
        "declaration-property-value-disallowed-list": null,
      },
    },
  ],
};
