#requires -Version 7.4
<#
.SYNOPSIS
    Endgame Gear 网页配置器的唯一验收入口。

.DESCRIPTION
    《用 AI 做项目：强制工程校验规范》v1.20.0 §脚本执行基线：npm scripts 只允许转发到
    .ps1，串联逻辑必须留在脚本里 —— `&&` 属 cmd 专有语法，写进 package.json 后
    同一入口在 PowerShell / cmd / sh 下的短路与退出码语义不同，「通过」不再只有一个含义。

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
$PSNativeCommandUseErrorActionPreference = $true

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

Write-Host "`n校验链全部通过。" -ForegroundColor Green
exit 0
