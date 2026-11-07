# Husky 钩子的激活与自查

> 本文原为 `AGENTS.md` §5 的一小节。2026-11-07 按规范 v1.20.0 §`agents-md`
> 「AGENTS.md 是目录，不是手册（≤150 行）」迁出：这是一次性排障步骤，
> 不是每次会话都必须读的规则。

## 症状

husky 9 的自动初始化需要 Node 能 `spawn git`。若 `npm run prepare` 报
`git command not found`，钩子不会生效——**`git commit` 将静默跳过门禁**，
看起来一切正常，实际没有任何拦截。

## 自查

```bash
git config core.hooksPath    # 应输出 .husky/_（不是 .husky）
```

输出为空或为 `.husky`，说明初始化没成功。

## 手动补齐

```bash
mkdir -p .husky/_ && printf '*' > .husky/_/.gitignore
cp node_modules/husky/husky .husky/_/h
for h in pre-commit commit-msg prepare-commit-msg pre-push post-checkout \
         post-merge post-rewrite pre-rebase post-commit applypatch-msg \
         pre-applypatch post-applypatch pre-merge-commit pre-auto-gc; do
  printf '#!/usr/bin/env sh\n. "$(dirname "$0")/h"' > ".husky/_/$h"
done
printf 'echo "husky - DEPRECATED"\n' > .husky/_/husky.sh
git config core.hooksPath .husky/_
```

> 这里的 sh 壳是 husky 自身的机制（钩子文件必须可被 git 以 sh 直接执行），
> 不属于规范 §`pwsh-only` 禁止的「cmd / bat 第二解析器」：壳里不含业务逻辑，
> 业务逻辑仍只存在于 Node / `.ps1` 脚本中。
