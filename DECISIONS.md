# DECISIONS.md — 决策日志（根目录）

> 追加式记录：被采纳的方案、被否决的替代方案、理由。旧方案归档于此，不留在主文档里。
>
> **本文件与 `docs/internal/DECISIONS.md` 的关系（2026-11-07 起）**：
> 根目录这份是**唯一活动台账**，新增条目写这里；`docs/internal/DECISIONS.md`（701 行、
> 2026-10-09 起的 40 余条记录）已**冻结**为历史正文，只读不改。
> 冻结而不迁移的理由：那 701 行是带完整证据链的原始记录，机械搬动只会引入 diff 噪音；
> 活动台账从根目录重新起算，历史按链接回查。
> 是否需要把历史正文整体迁到根目录，登记为 `TASKS.md` 的 T-03，属灰名单操作，待确认。

---

## D-001 · 2026-11-07 门禁升级到规范 v1.20.0：入口迁 pwsh、CI 统一 shell、AGENTS.md 目录化

- **背景**：本仓库的工程基线建立在规范较早版本（AGENTS.md 记为 v1.5.0）上，三处与 v1.20.0 冲突：
  ① `verify` 与 `check:ui` 是 `&&` 长链；② CI 的 `run` 步骤走默认 bash；③ `AGENTS.md` 178 行且含成段抄录。
- **决策**：
  1. `verify` → `pwsh -NoLogo -NoProfile -File ./scripts/verify.ps1`，`verify:ci` → 同一脚本加 `-Ci`；
     `check:ui` → `scripts/check-ui.ps1`。串联逻辑与 UTF-8 环境设置全部移入脚本。
  2. 两套 workflow 全部加 `defaults.run.shell: pwsh`；原先依赖 bash 的三段（grep 查产物、
     grep 查提交信息、mkdir/cp 组发布目录）用 `Select-String` / `New-Item` / `Copy-Item` 等价重写。
  3. `AGENTS.md` 拆分：husky 排障 → `docs/husky-setup.md`，ESLint 预算 → `docs/eslint-budget.md`，
     条款正文改为规范锚点，178 → 140 行以内。
- **理由**：`&&` 的短路与退出码传播依赖 shell 实现，写进 npm scripts 后同一入口在
  PowerShell / cmd / sh 下语义不同；CI 若继续混用 bash 与 pwsh，两者对「命令失败」的判定
  也不同。规范要求的「通过」必须只有一个含义。
- **被否决的替代方案**：
  1. 保留 `&&` 链，登记 `config/script-baseline-exempt.txt` 豁免 —— 豁免只把返工推迟到到期日，
     而迁移成本是一次改写。
  2. 把 `re/check_verify.mjs` 的 REQUIRED 清单降级为「只检查 verify 存在」—— 那正是该脚本
     设计上要堵的自指漏洞，等于关掉「verify 被悄悄削弱」的检测。
  3. 保留 CI 的 bash 步骤，只在 workflow 顶部加注释说明 pwsh 优先 —— 注释不构成门禁。
- **影响面**：`package.json` 三行、新增 `scripts/verify.ps1` / `scripts/check-ui.ps1` /
  `scripts/check-script-baseline.ps1`、`re/check_verify.mjs` 的链条读取逻辑（支持 `&&` 内联与
  `.ps1` 转发两种形态，可回滚）、两套 workflow、`AGENTS.md` 与两个新文档。
- **复审条件**：若某次 CI 在 ubuntu runner 上因 pwsh 版本低于 7.4 失败，需改为
  `actions/setup-powershell` 显式钉版本，并在此登记。

---

## D-002 · 2026-11-07 `re/check_verify.mjs` 改为读 `scripts/verify.ps1`

- **决策**：新增 `readChain(script)`：若 `package.json` 的入口是 `pwsh -File x.ps1` 转发形态，
  则读该 `.ps1` 全文作为链条文本；否则退回读 `package.json` 那一行。
- **理由**：入口迁走之后，自检脚本若仍只读 `package.json`，看到的就是一行 pwsh 命令——
  「少了一段门禁」再也报不出来，自检从结构校验退化为存在性校验。
- **被否决的替代方案**：让 `verify.ps1` 里保留 `npm run xxx &&` 字符串供正则匹配 ——
  为迎合检查器写假字符串，是让门禁与实现互相欺骗。
- **复审条件**：若将来引入第三种入口形态（如 `node scripts/verify.mjs`），`readChain` 需同步扩展。

---

## D-003 · 2026-11-09 ESLint 预算登记为正式豁免（偏离 `--max-warnings=0`）

- **背景**：规范 v1.21.0 的强制基线是 `--max-warnings=0`。本项目实际是 `--max-warnings=81`，
  且同一个数字曾在三处出现并各自漂移：`package.json` 为 81、`docs/eslint-budget.md` 写 88、
  `.husky/pre-commit` 注释写 154。这不是「放宽」，是**三个手抄副本**——规范
  §`single-source-of-truth` 预言的失效方式。
- **决策**：
  1. 数值以 `npx eslint src` 的实测存量为准（2026-11-09：0 error / 81 warning），
     唯一写入点收敛到 `package.json` 的 `lint` 脚本；其余位置只解释、不抄数字。
  2. 该偏离按规范 §豁免流程登记为本条决策：机读标记见 `eslint.config.mjs`
     的 `verify-exempt:` 注释，**到期日 2026-12-31**。
  3. 到期未清零则必须重新提案并说明剩余来源，不得静默续期。
- **理由**：一次性把 81 处 `any` 设为 error 会让 verify 与 CI 永久变红，而「门禁常红」
  等于把门禁关掉——规范同样禁止。预算式门禁保留拦截力（新增即失败），且只降不升。
- **被否决的替代方案**：
  1. 直接设 `error` 并接受 CI 常红 —— 两周内所有人都会习惯红色，等于关掉整条链。
  2. 保持 `--max-warnings 154` / 88 不动 —— 阈值高于存量时门禁形同虚设，
     新增 any 不会失败，与「有门禁」无法区分。
  3. 关闭 `no-explicit-any` 规则 —— 失去可见性，存量再也不会被清理。
- **影响面**：`package.json` 一行、`docs/eslint-budget.md`、`eslint.config.mjs` 注释、
  `scripts/hooks/pre-commit.ps1`（不再重复数字）。
- **复审条件**：2026-12-31 前复审一次；存量降到 0 时立即删除本豁免并改回 `=0`。

---

## D-004 · 2026-11-09 构建指纹改为内容哈希（产物可复现）

- **背景**：`tools/build.mjs` 原先用「commit 短哈希 + UTC 分钟」作指纹。三个后果：
  ① 提交产物会改变 HEAD，产物永远落后一次提交，每次提交后都要补一个
  `chore(build): 重建产物` —— 自指的提交循环，历史里已重复三次；
  ② 时间戳使产物不可复现，`git diff` 无法用来判定「改了文档忘记重建」；
  ③ commit 哈希区分不出「同一提交下本地改过的页面」，而这正是指纹最初要解决的情形（issue #1）。
- **决策**：指纹改为产物内容的 SHA-256 前 8 位，在 bundle / 样式 / 渲染后的清单注入之后计算。
  页面页脚与诊断包 `meta.build` 均显示该哈希。
- **理由**：内容哈希对上述三点同时成立——同样输入必得同样字节（可复现）、
  任何输入改动都会变（可判定）、本地手改也会变（正是志愿者排查缓存问题的需要）。
  构建日期回归 `CHANGELOG.md` 与 release note，产物本身只需要一个稳定身份。
- **被否决的替代方案**：
  1. 保留时间戳，一致性检查时用正则把指纹行抹掉再比对 —— 掩盖症状：产物仍然每次不同，
     且「抹掉哪一行」成为需要维护的第二个清单。
  2. 指纹取「最后一次触碰输入的提交」的日期 —— 需要完整历史；CI 默认浅克隆只拿到 HEAD，
     本地与 CI 会得出不同结果。
  3. 干脆去掉指纹 —— 失去 issue #1 依赖的「测的是哪一版」定位能力。
- **影响面**：`tools/build.mjs`（指纹生成与注入顺序）、`index.html` 页脚、
  诊断包 `meta.build` 的取值形态（`<commit> · <时间>` → 8 位十六进制）。
  `src/version.ts` 的占位符机制不变。
- **复审条件**：若将来需要「构建日期」进入产物（例如发布合规要求），改为由
  `SOURCE_DATE_EPOCH` 注入，而不是回退到 wall clock。

---

## D-005 · 2026-11-09 `pre-commit` 改为纯转发薄壳

- **背景**：`.husky/pre-commit` 原是 `#!/bin/sh` 且内含五条 npm 命令（两次 tsc、两次 eslint、
  一次 markdownlint --fix）。规范 v1.21.0 §脚本执行基线要求钩子只能是「shebang pwsh」
  或「唯一动作是 exec pwsh 的薄壳」，业务逻辑必须留在 `.ps1` 里。
- **决策**：钩子改为一行 `exec pwsh -NoLogo -NoProfile -File .../pre-commit.ps1`；
  原五条命令原样迁入 `scripts/hooks/pre-commit.ps1`，行为不变（顺序、复查两次、
  `--fix` 后复验都保留），并补了 `-SkipFmt` 开关供不含 Markdown 的提交使用。
- **理由**：sh 里的 `npm run x || exit 1` 与 `.ps1` 里的 `Assert-Step` 是两套失败判定；
  同一份改动可能在钩子说通过、CI 说失败。薄壳化后二者共用一种语义。
  同时消除 `--max-warnings 154` 这个漂移副本（见 D-003）。
- **被否决的替代方案**：
  1. 保留 sh 逻辑、只在注释里声明「已按规范对齐」—— 注释不构成门禁。
  2. 钩子直接 `#!/usr/bin/env pwsh` —— 在 Git for Windows 下可行，但跨平台 clone
     仍需 sh 入口；本仓库面向 GitHub Pages 的协作者，薄壳兼容性更好。
  3. 把完整 verify 放进钩子 —— 十几秒的等待会把人推向 `--no-verify`，反而削弱门禁。
- **影响面**：`.husky/pre-commit`、新增 `scripts/hooks/pre-commit.ps1`。
- **复审条件**：若 husky 升级后不再从仓库根执行钩子，需复核 `$(dirname "$0")` 的相对路径假设。

---

## 决策日志格式

新增条目按 D-00N 递增，字段固定为：背景 / 决策 / 理由 / 被否决的替代方案 / 影响面 / 复审条件。
「更新措辞」不构成一条决策。
