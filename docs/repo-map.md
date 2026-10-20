# 仓库目录说明（每个文件的作用）

**简体中文 | [English](repo-map.en.md)**

> 新协作者从这里开始。按目录分组；"每个文件在哪儿、干什么"一图流。
> 维护约定：新增顶层目录或改变文件职责时同步更新本文件。

## 根目录 —— 元文档（活文档）

| 文件 | 作用 |
|---|---|
| `README.md` / `README.zh-CN.md` | 项目门面，英文版 + 简体中文完整版，顶部互链 |
| `AGENTS.md` | 给 AI 协作者的工程规范说明（含规范版本引用） |
| `CHANGELOG.md` | 版本变更记录（语义化，自 v1.3 起维护） |
| `DECISIONS.md` | 判例集（append-only）：每条架构/清理决策的背景与理由 |
| `TASKS.md` | 唯一任务队列：T-xxx 编号、依赖、完成状态 |
| `MANIFEST.md` | 第三方素材合规清单（`re/upstream/` 收录物的许可证结论） |
| `LICENSE` | GPL-3.0-or-later 全文 |

## 根目录 —— 构建与工程配置

| 文件 | 作用 |
|---|---|
| `build.mjs` | 构建脚本：esbuild 打包 TS + sass 编译 SCSS + 注入模板 → 单文件产物；含体积门禁（`SIZE_BUDGET_KB`） |
| `index.template.html` | 页面骨架模板，只有 `/*__BUNDLE__*/`、`/*__STYLES__*/`、`/*__CHECKLIST__*/` 占位符 |
| `index.html` | **最终产物**（根目录副本），零依赖单文件，双击即用，GitHub Pages 直接指向它 |
| `package.json` / `package-lock.json` | npm 依赖与脚本（build/check/verify/lint 全链） |
| `tsconfig.json` / `eslint.config.mjs` / `knip.config.js` | TS 严格检查 / ESLint（81 警告阈值）/ 未使用导出检测 |
| `stylelint.config.cjs` / `.markdownlint-cli2.jsonc` / `commitlint.config.cjs` | SCSS / Markdown / 提交信息（标题 ≤ 72 字符）三个 lint 规则 |
| `docs/.markdownlint.jsonc` | docs/ 目录的 markdownlint 局部豁免 |
| `.gitignore` / `.nojekyll` | 忽略厂商二进制与产物 / 禁用 Pages 的 Jekyll（防下划线文件被排除、构建失败整站 404） |
| `.husky/pre-commit` / `.husky/commit-msg` | git 钩子：提交前跑完整 verify、提交信息过 commitlint |
| `.github/workflows/verify.yml` | CI：ubuntu + windows 双平台跑全套校验 |
| `.github/workflows/deploy.yml` | CI：构建产物发布到 GitHub Pages |

## `src/` —— TypeScript 源码（严格分层，自底向上）

| 文件 | 作用 |
|---|---|
| `state.ts` | 最底层：全局状态存储 |
| `transport.ts` | HID 传输层：开关接口、feature report 收发、官方同款重试（错误码 ×4 次 50ms） |
| `protocol.ts` | 4k 家族协议：命令表（0x0F/0x0D/0x0E/0xB4/0x12…）、状态码、blob 读写 |
| `blob.ts` | 1024B 配置 blob 的字节级编解码 |
| `verify.ts` | 写入安全：回读校验、diff 预览、发送层白名单 |
| `device-4k.ts` / `device-8k.ts` / `device-xm1.ts` | 三个设备族的高层封装（4k 无线 / 8k 有线 / XM1） |
| `xm2we.ts` / `xm2we-ui.ts` | 完全独立的第二协议家族（2020 有线/2.4G）实现 + 其专属 UI |
| `render.ts` | 状态 → DOM 渲染 |
| `presence.ts` | 连接健壮性：disconnect 事件 + 周期枚举双信号，设备消失自动回初始屏 |
| `session.ts` | 连接会话编排 |
| `connect.ts` | "连接设备"按钮逻辑与接口选择 |
| `layout.ts` | **UI 自适应的唯一决策点**：按连接型号决定显示/隐藏哪些卡片 |
| `diag.ts` | 诊断：导出测试数据包 (.json) |
| `err.ts` / `util.ts` | 错误类型 / 通用工具函数 |
| `i18n.ts` | i18n 核心：8 语言词条表、浏览器语言检测、`applyI18n()`（含清单卡片双语切换） |
| `i18n/de·es·fr·ja·ko·zh-TW.ts` | 6 种非默认语言的词条文件（zh-CN 与 en 内置于 i18n.ts） |
| `types/webhid.d.ts` | WebHID 的 TS 类型声明 |

## `scss/` —— 样式唯一来源

| 文件 | 作用 |
|---|---|
| `_tokens.scss` | 设计令牌：颜色 / 间距 / 圆角 / 字号 |
| `_mixins.scss` | SCSS 混入 |
| `main.scss` | 主页面组件样式 |
| `studio.scss` | blob-studio 工具页样式 |

构建时全部编译内联进 HTML，产物不含任何外部样式文件。

## `tools/` —— 构建辅助与独立工具

| 文件 | 作用 |
|---|---|
| `md2html.mjs` | 极简 Markdown→HTML 转换器，构建时把测试清单渲染进页面 |
| `blob-studio.template.html` / `blob-studio.html` | 离线 blob 分析器（模板/产物）：粘贴 hex 或 JSON 解析成字段表，双份自动差分 |

## `docs/` —— 面向人的文档

| 文件 | 作用 |
|---|---|
| `remote-beta-guide.md` / `.en.md` | 远程志愿者流程（风险、备份、恢复），双语互链 |
| `test-checklist.md` / `.en.md` | 测试清单（唯一真相源，构建时进页面），双语 |
| `xm1-diff-kit.md` | XM1 差分实验包说明 |
| `official-product-catalog.md` | 16 款鼠标的固件/工具版本与官方下载目录 |
| `ecosystem-survey.md` | 社区同类工具生态调研 |
| `audit-2026-10-20.md` | 全量代码/架构审计报告（原子性、严谨性、潜在缺陷与结论） |
| `release-safety-audit.md` | 发布安全审计：逐型号写权限的理由与残余风险 |
| `cpi-step-check.md` / `field-parity.md` / `user-facing-settings.md` / `web-driver-extra-features.md` | 专项分析：CPI 步进一致性 / 各族字段对齐表 / 用户可见设置清单 / 官方工具额外功能盘点 |

## `re/` —— 逆向工程证据链与测试（不参与构建）

| 分组 | 作用 |
|---|---|
| `PROTOCOL_NOTES.md` / `XM1_NOTES.md` / `FAMILY4_NOTES.md` | 三大协议族的完整逆向笔记（证据链正文） |
| `test_*.ts`（10 个） | 离线回归测试：8k 写入、CPI 步进、写入门、XM1 写入、XM2we 模拟、repo 卫生等（`run_test.mjs` 统一驱动） |
| `check_verify.mjs` / `i18n_audit.mjs` | verify 流程结构自检 / i18n 完整性审计 |
| `i18n_check.py` / `layout_check.py` / `render_check.py` / `reset_check.py` | 四个专项静态检查脚本 |
| `_domstub.ts` | 测试用 DOM 桩 |
| `archive/*.py`（11 个） | 已归档的一次性反汇编/扫描脚本（留证不维护） |
| `upstream/`（30+ 个） | 从官方工具二进制提取证据的脚本与中间产物：`xm1_*` 系列（XM1 反汇编）、`tool8k_*` 系列（8k 工具 PID 提取）、`is_*` 系列（InstallShield 解包）、`xm2we_PROTOCOL.md` 与 `xm2we_linux.py`（上游收录）、`we_series_cfg.ini`（OP1we PID 来源）等；合规结论见 `MANIFEST.md` |
