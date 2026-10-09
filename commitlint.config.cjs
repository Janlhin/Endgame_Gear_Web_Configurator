// commitlint 配置：提交信息必须符合 Conventional Commits。
//
// 与 CI 的口径关系（重要，改动时须同步）：
// verify.yml 里有一条 `git log -1 | grep -E '^(feat|fix|docs|refactor|chore|
// perf|test|build|ci)...'` 检查。本配置**有意比它宽**——多允许
// `research` 与 `re` 两个类型。理由见下方「为什么允许多两个类型」。
//
// 这样CI 仍是最终判定通道，且结论与本地一致；本文件不是替代品。
// 历史上确有一条提交（005bffd）无类型前缀，CI 那条正则对它会报错，
// 但它只检查最近一次提交，不追溯历史——这是既有设计，不在本次改动范围。

module.exports = {
  extends: ["@commitlint/config-conventional"],
  // type-enum 在 conventional 默认值（feat/fix/...）基础上追加两个。
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", "fix", "docs", "refactor", "chore",
        "perf", "test", "build", "ci",
        // 下面两个是本项目逆向研究阶段实际用过的类型（2026-10-08）：
        //   research: 调研与交叉验证，无代码产出
        //   re:        协议取证，有代码/文档产出但不属于产品功能
        // 不用它们表达「调查」而硬塞进 docs，会让「逆向结论」与
        // 「文档整理」在历史里混为一谈——而这两类变更的审查方式不同。
        // 已核对：历史中 research 3 条、re 3 条，全部语义贴切，无滥用。
        "research", "re",
      ],
    ],
    // 标题长度上限 72，与 CI 正则不冲突，但能挡住「一句话写三百字」的标题。
    "header-max-length": [2, "always", 72],
    // subject 用祈使语气、无句号 —— Conventional Commits 的通行要求
    "subject-case": [0],
    "subject-full-stop": [2, "never", "."],
    // scope 大小写统一小写（历史上出现过 ui / i18n / write 混用）
    "scope-case": [2, "always", "lower-case"],
  },
};