#requires -Version 7.4
<#
.SYNOPSIS
    Endgame Gear 网页配置器的唯一验收入口。

.DESCRIPTION
    《用 AI 做项目：强制工程校验规范》v1.21.0 §脚本执行基线：npm scripts 只允许转发到
    .ps1，串联逻辑必须留在脚本里 —— npm 的内联串联由平台 shell 解析（Windows 上先经
    cmd.exe，POSIX 上经 sh），写进 package.json 后同一入口在不同平台会落到不同解析器，
    「通过」不再只有一个含义。

    链条顺序即执行顺序，快 → 慢。每一段都以 `npm run <name>` 原文出现，
    因为 re/check_verify.mjs 会逐段核对本文件：少一段就报错。
    改本文件前，先改 re/check_verify.mjs 的 REQUIRED 清单。

.PARAMETER Ci
    跨平台子集：跳过依赖 Windows 预装 msedge.exe 的 check:ui。
    CI 的 windows job 会单独跑更全的 UI 演练（多一个 reset_check.py），
    所以这里的跳过是「换地方跑」，不是「少跑」。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/verify.ps1
#>
[CmdletBinding()]
param(
    [switch]$Ci
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# 手工检查 $LASTEXITCODE 时**不能**同时开启 $PSNativeCommandUseErrorActionPreference：
# 那会把非零退出变成终止错误，Assert-Step 的自定义诊断与原始退出码都拿不到
# （2026-11-09 实测：check:artifact 失败时只抛 NativeCommandExitException，
# 看不出是哪一段、退出码也被改写）。两种写法只能选一种。
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

function Assert-Step {
    param([Parameter(Mandatory)][string]$Label)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "失败：$Label（退出码 $LASTEXITCODE）" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "Endgame Gear 网页配置器 · 校验链$(if ($Ci) { '（CI 子集）' })" -ForegroundColor White

# 0. 脚本执行基线：无 cmd / bat、无第二解析器、CI 走 pwsh
Write-Host "`n==> 脚本执行基线" -ForegroundColor Cyan
& pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'check-script-baseline.ps1')
Assert-Step '脚本执行基线'

# 0.5 文档结构：五件套、AGENTS.md 行数、相对链接可达
Write-Host "`n==> 文档结构" -ForegroundColor Cyan
& pwsh -NoLogo -NoProfile -File (Join-Path $PSScriptRoot 'check-docs.ps1')
Assert-Step '文档结构'

# check:meta 排在最前：它校验的正是这条链本身有没有被削弱
Write-Host "`n==> npm run check:meta" -ForegroundColor Cyan
& npm run check:meta
Assert-Step 'check:meta'

# 根目录按白名单（规范 §layout 第 597 行）：差集非空即失败。
# 连未 git add 的新文件也比对，堵住「先放后报」；获批例外见 D-007。
Write-Host "`n==> npm run check:layout（根目录白名单）" -ForegroundColor Cyan
& npm run check:layout
Assert-Step 'check:layout'

Write-Host "`n==> npm run check" -ForegroundColor Cyan
& npm run check
Assert-Step 'check'

Write-Host "`n==> npm run lint" -ForegroundColor Cyan
& npm run lint
Assert-Step 'lint'

Write-Host "`n==> npm run lint:docs" -ForegroundColor Cyan
& npm run lint:docs
Assert-Step 'lint:docs'

Write-Host "`n==> npm run lint:css" -ForegroundColor Cyan
& npm run lint:css
Assert-Step 'lint:css'

Write-Host "`n==> npm run test" -ForegroundColor Cyan
& npm run test
Assert-Step 'test'

Write-Host "`n==> npm run check:i18n" -ForegroundColor Cyan
& npm run check:i18n
Assert-Step 'check:i18n'

# 清理阈值层：knip 只把「未使用的文件」判为 error（见 knip.config.js 的 rules），
# 「导出无人使用」是 warn —— 56 条存量里多数是协议 API 面，不当门禁。
# 这一段的实际拦截力是「新增孤儿文件」，比裸跑 knip 的噪音报告有用。
Write-Host "`n==> npm run knip" -ForegroundColor Cyan
& npm run knip
Assert-Step 'knip'

if ($Ci) {
    Write-Host "`n==> 跳过 npm run check:ui（CI 子集；界面演练在 windows job 单独跑）" -ForegroundColor DarkGray
}
else {
    Write-Host "`n==> npm run check:ui" -ForegroundColor Cyan
    & npm run check:ui
    Assert-Step 'check:ui'
}

Write-Host "`n==> npm run build" -ForegroundColor Cyan
& npm run build
Assert-Step 'build'

# 文档与代码一致（三层校验的第二层）：index.html 是 docs/test-checklist*.md 的生成物。
# 放在 build 之后 —— 它比对的正是刚构建出来的东西，改了文档不重建会被这一步拦住。
Write-Host "`n==> npm run check:artifact（产物与源码/文档一致）" -ForegroundColor Cyan
& npm run check:artifact
Assert-Step 'check:artifact'

Write-Host "`n校验链全部通过。" -ForegroundColor Green
exit 0
