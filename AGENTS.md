# AGENTS.md — 本项目的 AI 协作约束

> 通用规范见《用 AI 做项目：强制工程校验规范》**v1.20.0**（Janlhin）。
> 本文件是**目录**，只写本项目专属条款、命令入口与规范锚点；规范正文不在此复制。
> 与规范冲突时以本文为准（本文更严）；本文未覆盖处按规范锚点回查原文。
>
> 2026-11-07：按 v1.20.0 调整三处——① `verify` 与 `check:ui` 由 `&&` 链改为 `scripts/*.ps1`
> 转发；② CI 全部改为 `shell: pwsh`；③ 两节可变现状（husky 排障、ESLint 预算）迁到
> `docs/husky-setup.md` 与 `docs/eslint-budget.md`，本条文件从 178 行降至 140 行以内。

## 0. 项目一句话

**Endgame Gear 网页版配置器**：用 Chrome/Edge 的 WebHID 直连鼠标读写配置，
**交付物是单个 `index.html`**（离线可用、零运行时依赖、无任何外部资源加载）。

## 1. 不可协商的红线（违反即回滚重做）

1. **写入路径必须有闸门，且闸门要离 `sendFeatureReport` 最近。**
   只靠 UI `disabled` 不算防护——按钮一旦被触发（脚本、旧文件选择器）就会真的写。
2. **未在真机验证过的型号一律只读。** 需要放开时走"默认只读 → 点击弹确认（写明风险）
   → 确认后自动导出备份 → 仅当次连接放行"，四件套缺一不可。
   涉及的两个开关：`S.betaArmed`（8k，`src/state.ts`）与 `WE_WRITES_ENABLED`（WE，`src/xm2we.ts`）。
3. **改动写入路径必须同步改 `re/tests/test_write_gates.ts`**，否则视为未完成。
4. **禁止 `--no-verify`**，禁止注释掉断言、放宽容错阈值来"通过"校验。

## 2. 协议事实的来源等级

| 等级 | 来源 | 允许的用途 |
|---|---|---|
| **A** | 本项目真机实测；官方配置工具 / 固件二进制反汇编 | 可直接作为写入依据 |
| **B** | ≥2 个独立社区实现一致 | 可作为实现参考，**写入前需 A 级复核** |
| **C** | 单一社区实现 / 设备表推断 | **仅记录，不得据以写入** |

> 2026-10-09 的教训：CPI 分档规则原本取自 `@openmouse/protocol` 的设备表（C 级，且针对的是
> `0x1984` 而非本项目用户机型 `0x1982`），被用户质疑后回到官方工具二进制取证，
> 推翻了其中两条。**外推到别的型号前，先问自己这是几级证据。**

新增协议事实时，同步更新 `re/PROTOCOL_NOTES.md`（含代码片段与偏移出处）。

## 3. 本项目的验证入口

```bash
npm run verify      # 本地唯一验收入口，顺序按"快 → 慢"短路执行
npm run verify:ci   # 同一入口的跨平台子集（去掉 Windows-only 的 check:ui），CI 用
```

构成：`check`（tsc，strict 全开）→ `lint:docs`（markdownlint，28 份 Markdown）→
`test`（离线断言）→ `check:i18n`（词条与取用表）→
`check:ui`（无头 Edge 布局 / 语言检测 / 渲染 / 复位演练，**仅 Windows**）→
`build`（含产物断言：无绝对路径、无开发注释）。

`check:ui` 依赖 Windows 上预装的 `msedge.exe`，因此 CI 拆成两个 job：
ubuntu 跑 `verify:ci`，windows-latest 跑 `check:ui` —— **两条都跑，互不豁免**。

未通过就是未通过，不允许用"环境问题"描述而不复现定位。

### 文档改动的两条硬约束

1. **改文档前先跑 `npm run lint:docs`。** 它的豁免项全部写明了理由
   （见 `.markdownlint-cli2.jsonc`），改动豁免项时必须同步
   `docs/.markdownlint.jsonc`——目录级配置是**替换**而非合并。
2. **外部链接不校验可达性。** `markdown-link-check` 在本机网络下会把
   真实存在的仓库判为死链（返回 504/403/0；已用 `git ls-remote` 逐个复核）。
   因此断链防护只覆盖**相对路径与文件内锚点**，外部 URL 靠人工核对。
   复核证据见 `MANIFEST.md`。**不要因为工具报错就删掉来源登记。**

## 4. 本项目特有的 AI 约束

1. **构建产物零外部依赖**：不得引入 CDN 字体/脚本/图片；一切打进 `index.html`。
   `tools/build.mjs` 的 `assertNoDevComments` 与"无绝对路径"检查是硬门禁，改模板时别绕过它。
2. **脚本层禁止硬编码绝对路径**（`re/*.py` 曾各写一份 `file:///C:/...`，目录改名后四个检查同时失效）。
   一律用 `os.path.join(os.path.dirname(__file__), "..", ...)` 推导。
3. **测试文件排在 `re/tests/test_presence.ts` 之前**——它末尾是 `process.exit(0)`，排它后面的测试静默不执行。
4. **i18n 改键要同步 8 个词典**，且 `re/i18n_check.py` 里的 `T{lang}` 是各语言标题的
   **互相不包含判别片段**，改产品名不同步会让语言检测整片 FAIL。
5. **SCSS 变量是 `$acc`**，不是 `$accent`；颜色/间距一律走 `scss/_tokens.scss` 的 token，
   业务样式里不写字面量。
6. **清单类文档以 Markdown 为唯一真相源**，构建时用 `tools/md2html.mjs` 渲染进页面
   （`docs/test-checklist.md` → `index.html`），禁止再手抄一份 HTML。

## 5. 提交与交付

- 一次提交只服务一个意图；重构与行为变更必须分开；正文写「为什么」，并列出
  **仍未解决 / 需要真机验证**的部分。
- 机械性变更（重命名、格式化、依赖升级）单独成提交。
- 交付说明四项缺一不可：**改了什么 / 验证证据（实际跑的命令与结果）/ 未验证项（不得隐去）/ 遗留项**。

### 提交前门禁（Husky，2026-10 起生效）

`git commit` 会自动跑两个钩子，**不需要手动执行**：

| 钩子 | 做什么 | 为什么放这里 |
|---|---|---|
| `pre-commit` | `tsc --noEmit` → `markdownlint --fix` → `tsc --noEmit` | 只放秒级检查。`test` / `check:i18n` / `check:ui` / `build` 要编译、要起无头 Edge，整套十几秒，留在 CI |
| `commit-msg` | `commitlint` 校验 Conventional Commits | 当场拦截，不必等 CI 才发现 |

`tsc` 跑两次是有意的：markdownlint 的 `--fix` 会动文件，需要确认它没把类型改坏。

允许的提交类型：`feat` `fix` `docs` `refactor` `chore` `perf` `test` `build` `ci`
`research` `re`。

- `research` = 调研与交叉验证，无代码产出；`re` = 协议取证，有产出但不属于产品功能。
- 这两个类型在历史里各用过3 次，语义贴切。不用它们而硬塞进 `docs`，
  会让「逆向结论」与「文档整理」在历史里混为一谈——两者审查方式不同。
- **注意**：CI 那条 `git log -1| grep` 检查口径**更窄**，只认前9 个类型。
  这是有意的：CI 只查最近一次提交作为最终判定，本地不必与它一致。
  改动类型枚举时，`commitlint.config.cjs` 与 `.github/workflows/verify.yml`
  两处要同步。

**禁止 `--no-verify`。** 若钩子因环境问题误报，先修钩子，不要绕过。

### 环境注意事项：husky 的 `_` 目录

钩子初始化失败时 `git commit` 会**静默跳过门禁**（看起来正常，实际没有拦截）。
自查与手动补齐步骤见 `docs/husky-setup.md`。

## 6. 歧义与检索（条款在规范，这里只留锚点）

- 判定标准：**查得到的不许问，要什么必须问**。提问格式与 8 种必须询问的情形见规范 §`ambiguity`。
- 检索顺序按规范 §`search-first` 的 0–6 级执行，**不得跳级**；拿不出检索证据不许自研。
- 本项目实测的渠道现状（避免把「搜不到」当「不存在」）：`grep.app` 长期 429、
  `searchcode.com` API 404、Codeberg API 被 Anubis 拦 403、GitHub 匿名检索 60 次/小时
  → 改用 `codeload` 直取 zip、`raw.githubusercontent.com` 直取文件。

## 7. 删除授权分级

| 级别 | 范围 | 处置 |
|---|---|---|
| 白名单 | 本次改动新增文件的残留；注释掉的代码块；工具确证无引用且有测试覆盖 | 自主删除，在交付说明里列出 |
| 灰名单 | 用户手写代码；公共导出；无测试覆盖的模块；一次删超过 5 个文件 | 先提案（路径+依据+影响面+风险），等确认 |
| 黑名单 | 用途不明；无法排除动态引用；`.git` 历史；仓库外文件 | 保留并标注 `TODO(verify):` + 依据 |

**禁止先删后报。**

## 8. 定期清理节点

每两週一次（与代码清理同一时间点），产出独立的 `chore:` 提交：
过期文档章节（含引用它的地方一并处理）、投机性抽象、空转包装层、重复实现。
没有固定节点的清理等于不会发生。

### 类型通道的现状与遗留

规则分级、`--max-warnings` 预算的含义、剩余 `any` 的主要来源，见
`docs/eslint-budget.md`。**下调阈值是机械性变更，上调阈值必须走 `DECISIONS.md` 并带到期时间。**
