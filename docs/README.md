# 文档索引

> 这里 17 份文档分四档。**先看这张表再点文件**，能省掉大量翻找。
>
> **English readers**: three documents have English versions —
> [`test-checklist.en.md`](test-checklist.en.md) (what to test, step by step),
> [`remote-beta-guide.en.md`](remote-beta-guide.en.md) (the volunteer process and the risks),
> [`repo-map.en.md`](repo-map.en.md) (what every file is for). Everything else is Chinese.

## 一、对外 —— 使用与测试

| 文件 | 什么时候读 |
|---|---|
| [`test-checklist.md`](test-checklist.md) / [`.en.md`](test-checklist.en.md) | 你手上有 EGG 鼠标，想帮测或自己回归。**同一份内容也是页面里「测试清单」的真相源**，构建时内联 |
| [`remote-beta-guide.md`](remote-beta-guide.md) / [`.en.md`](remote-beta-guide.en.md) | 第一次尝试写入，想知道风险、备份与恢复怎么做 |
| [`repo-map.md`](repo-map.md) / [`.en.md`](repo-map.en.md) | 想读懂代码结构：每个文件是干什么的 |

## 二、内部研究 —— 结论与依据

| 文件 | 内容 |
|---|---|
| [`ecosystem-survey.md`](ecosystem-survey.md) | 社区同类工具全景（官方 11 仓库 / 社区 27 项目），以及本项目的定位判断 |
| [`field-parity.md`](field-parity.md) | 各族字段对齐表：哪些字段与官方工具一致、哪些有冲突 |
| [`official-product-catalog.md`](official-product-catalog.md) | 16 款鼠标的型号、固件与官方工具版本对照 |
| [`user-facing-settings.md`](user-facing-settings.md) | 用户可见设置的实现状态（做了 / 没做 / 为什么） |
| [`web-driver-extra-features.md`](web-driver-extra-features.md) | 官方工具具备、本项目尚未覆盖的功能盘点 |
| [`cpi-step-check.md`](cpi-step-check.md) | CPI 步进规则的一致性核对 |
| [`xm1-diff-kit.md`](xm1-diff-kit.md) | XM1 差分实验包：怎么一次只改一个值来定位偏移 |

## 三、历史快照 —— 只读，不改写

三份都带「状态快照」前言，记录的是当时结论；**当前状态请看 README / CHANGELOG / test-checklist**。

| 文件 | 时点 |
|---|---|
| [`audit-2026-10-20.md`](audit-2026-10-20.md) | 全量代码与架构审计 |
| [`release-safety-audit.md`](release-safety-audit.md) | 发布前逐型号写权限审计 |
| [`unofficial-features-audit.md`](unofficial-features-audit.md) | 非官方功能的取舍审计 |

## 四、维护者过程文档

| 文件 | 内容 |
|---|---|
| [`internal/TASKS.md`](internal/TASKS.md) | 唯一任务队列：T-xxx 编号、依赖、完成判据 |
| [`internal/DECISIONS.md`](internal/DECISIONS.md) | 判例集（append-only）：每条决策的背景、被否决的方案与理由 |
| [`../AGENTS.md`](../AGENTS.md) | 给 AI 协作者的工程规范（根目录，需被工具自动发现，故不移动） |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 变更记录（根目录，随版本发布） |
| [`../MANIFEST.md`](../MANIFEST.md) | 第三方素材合规登记（根目录） |

## 建议的阅读顺序

1. **只想用工具** → `README` → `remote-beta-guide`
2. **想帮测** → `test-checklist` → 遇到问题看 `field-parity`
3. **想改代码** → `repo-map` → `re/PROTOCOL_NOTES.md`（逆向证据链正文）
4. **想知道「当初为什么这么定」** → `internal/DECISIONS.md`
