# 贡献指南

Endgame Gear 网页配置器是浏览器内的 WebHID 鼠标配置工具（TypeScript + SCSS，运行时零第三方依赖）。工程红线与 AI 协作约束见 [AGENTS.md](AGENTS.md)。

## 环境准备

- Node 版本以 [`.nvmrc`](.nvmrc) 为准（CI 用 `node-version-file` 读同一文件）。
- 安装依赖：

```powershell
npm ci
```

## 本地验收

唯一验收入口：

```powershell
npm run verify
```

跨平台子集（去掉 Windows-only 的浏览器演练，CI ubuntu 段使用）：

```powershell
npm run verify:ci
```

常用单项检查：

| 命令 | 作用 |
|---|---|
| `npm run check` | `tsc --noEmit` 类型检查 |
| `npm test` | 离线协议与断言测试（`re/run_test.mjs`） |
| `npm run lint` | ESLint（`src/`） |
| `npm run lint:docs` | Markdownlint 文档检查 |
| `npm run lint:css` | Stylelint（`scss/`） |
| `npm run check:i18n` | 多语言词条一致性 |

改动界面后，Windows 上还需跑 `npm run check:ui`（无头 Edge 演练）；该段不在无显示 CI 门禁内。

## 代码与文档位置

- `src/` — TypeScript 源码（协议、状态、界面、i18n）。
- `re/` — 协议取证笔记、离线测试与校验脚本。
- `docs/` — 用户文档、研究结论与维护者过程文档，索引见 [docs/README.md](docs/README.md)。
- `tools/` — 构建与 Markdown 转 HTML 工具。

## 提交规范

- 一个 commit 只做一件事（原子提交）；提交信息用 Conventional Commits（见 `commitlint.config.cjs`）。
- 禁止 `--no-verify`，不要注释断言或放宽容错阈值来“通过”校验。
- 改文档前先跑 `npm run lint:docs`。

## PR 要求

- PR 说明改动动机、影响面；本地先跑通 `npm run verify`（或在 CI 结论里如实标注未跑项）。
- 未真机验证的型号保持只读，写入范围以 `re/` 下协议笔记为准。
