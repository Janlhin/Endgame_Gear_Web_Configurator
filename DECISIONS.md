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

## 决策日志格式

新增条目按 D-00N 递增，字段固定为：背景 / 决策 / 理由 / 被否决的替代方案 / 影响面 / 复审条件。
「更新措辞」不构成一条决策。
