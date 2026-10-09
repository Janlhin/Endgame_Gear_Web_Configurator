/**
 * knip 配置 —— 死代码自动检测（T-110）。
 *
 * 【为什么需要】ESLint 的 `no-unused-vars` 只能看**单个文件内**的未使用变量，
 * 查不出「整个文件 / 某个导出没人用」。T-111 那 49 处死代码是逐个人工核实出来的，
 * 而「导出但无人 import」正是重构残留最典型的信号。
 *
 * ★ **裸跑 `npx knip` 的结果大量是误报**，因为本项目的入口不止 `src/main.ts`：
 *   · `re/test_*.ts` 由 re/run_test.mjs 用数组动态 import，knip 静态分析看不见；
 *   · `scss/*.scss` 由 build.mjs 里的 sass.compile 加载，不是 TS import；
 *   · `tools/blob-studio.template.html` 由 build.mjs 读字符串占位符注入。
 * 下面逐项声明这些入口 / 排除项，否则报告会把「测试文件」「样式文件」全列为未使用，
 * 让人误以为项目烂掉了——**一个满是误报的报告等于没有报告**。
 *
 * ★ 配置必须是 CommonJS（.js + module.exports）。
 *   knip 只认 knip.json[c] / knip.(js|ts) / knip.config.(js|ts)，
 *   **不认 .mjs**（实测：写成 knip.config.mjs 会被完全忽略，等于裸跑无配置）。
 *   ——与 Stylelint 的要求一致（见 stylelint.config.cjs 的注释）。
 */
module.exports = {
  entry: [
    "src/main.ts",       // 主程序唯一入口（build.mjs 的 entryPoints）
    "re/run_test.mjs",   // 测试入口：内部用 ENTRIES 数组动态 import 9 个 test_*.ts
  ],

  project: ["src/**/*.ts", "re/**/*.ts", "re/**/*.mjs"],

  // re/ 下是回归测试与逆向探查脚本。它们大量构造畸形输入来验证边界处理，
  // 任何「未使用」判断都无意义（本项目判例三：逆向脚本不参与清理）。
  ignore: [
    "re/test_*.ts",
    "re/_domstub.ts",
    "re/_rename.mjs",
    "scss/**",            // 样式由 sass 编译，knip 不该管
  ],

  // devDependencies 不作门禁：
  //   markdown-link-check —— T-101 决定不接入，但它是 MANIFEST.md 里
  //     9 个逆向来源链接的可复现核验手段，删了失去证据留档；
  //   stylelint-scss —— T-104 引入的 SCSS 插件（通过配置文件里的 plugins 字符串使用，
  //     knip 的静态分析看不见配置文件里的字符串引用）。
  ignoreDependencies: ["markdown-link-check", "stylelint-scss"],

  // 只查这两类。classMembers / enumMembers / duplicates 之类在本项目会产出
  // 大量噪音（interface 成员、index 签名），没有实际拦截价值。
  rules: {
    files: "error",
    exports: "warn",
    dependencies: "off",
    devDependencies: "off",
    unlisted: "off",
    unresolved: "off",
    binaries: "off",
    types: "off",
    duplicates: "off",
  },
};