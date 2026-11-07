# ESLint 预算：规则分级与 `any` 存量

> 本文原为 `AGENTS.md` §8 的一节。2026-11-07 按规范 v1.20.0 §`agents-md`
> 「AGENTS.md 是目录，不是手册（≤150 行）」迁出，理由：它是**可变的工程现状**，
> 每清一批 `any` 就要改数字，放在规则目录里会让目录每周变动一次。
> 规则入口见 `AGENTS.md`，决策背景见 `DECISIONS.md`。

## 一、规则分级（2026-10-09 起）

| 规则 | 级别 | 覆盖 |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | **error** | 全项目，已清零 |
| `@typescript-eslint/no-explicit-any` | **error** | 协议边界四文件（connect / device-8k / device-xm1 / blob） |
| `@typescript-eslint/no-explicit-any` | warn + 阈值 | 其余 14 个文件 |
| `no-useless-assignment` / `prefer-const` / `eqeqeq` / `no-var` | error | 全项目 |

**两处已升级为 error 的原因**（改动前请读）：

- `no-unused-vars`：49 处存量已逐个核实并清除（判据见 `docs/internal/TASKS.md` 的
  「死代码判定的三种手段」）。往后留下未使用的导入，提交会被直接拒绝。
  仍放行两类：`^_` 前缀（约定）与 catch 参数（语言强制无法省略）。
- 协议边界的 `no-explicit-any`：那里是 HID 数据进入代码的唯一入口，
  也是 XM1 配置清零事故的所在层。这层不允许再有 `any`。

## 二、阈值的含义

`--max-warnings 88` 等于当前存量，**不是随手填的**。多写一处 `any` 会让
`npm run verify` 立刻失败——这是设计意图。改动前先跑 `npx eslint src` 看真实计数，
清理一批就要同步下调。

## 三、最大的遗留

`util.ts` 里 `const $ = (id: string): any => document.getElementById(id)`
是 121 处 DOM 调用的类型源头，`S` 本身也是 `any`。这两处构成剩余 85 处 `any`
的主要来源（`docs/internal/TASKS.md` 的 T-112）。在它收敛之前，`$("x").anything` 不会报错。

## 四、维护责任

- 下调阈值 = 机械性变更，独立 `chore:` 提交。
- 上调阈值 = 放宽门禁，须在 `DECISIONS.md` 记录理由与到期时间，禁止在功能提交里顺手改。
