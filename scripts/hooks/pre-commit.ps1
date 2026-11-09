#requires -Version 7.4
<#
.SYNOPSIS
    提交前门禁的业务逻辑。

.DESCRIPTION
    `.husky/pre-commit` 只是一层 sh 薄壳，唯一动作是 exec 本脚本
    （规范《用 AI 做项目：强制工程校验规范》v1.21.0 §脚本执行基线：
    钩子只能是 shebang pwsh 或纯转发薄壳，业务逻辑必须留在 .ps1 里）。
    这样钩子的语义不随平台 shell 变化，与 `npm run verify` 共用同一种失败判定。

    这里只放秒级检查，完整链条仍由 `npm run verify` 与 CI 负责：

        tsc --noEmit        主类型通道
        eslint              类型通道的第二道（禁 any 等）
        markdownlint --fix  文档结构（只修可自动修的）
        tsc / eslint 再跑   确认 --fix 没把代码改坏

    不放这里的：test / check:i18n / check:ui / build —— 它们要 esbuild 编译、
    起无头 Edge、构建单文件，整套跑完十几秒。放 CI。

.PARAMETER SkipFmt
    跳过 markdownlint --fix 与随后的复查。仅用于「本次提交不含 Markdown」时
    节省时间；不改变类型与 lint 两道必需通道。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/hooks/pre-commit.ps1
#>
[CmdletBinding()]
param(
    [switch]$SkipFmt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# 与 verify.ps1 同：手工检查 $LASTEXITCODE，故不开启原生命令的终止错误语义。
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $RepoRoot

function Assert-Step {
    param([Parameter(Mandatory)][string]$Label)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "提交被拦截：$Label 未通过（退出码 $LASTEXITCODE）。" -ForegroundColor Red
        Write-Host '修好再提交；不要用 --no-verify 绕过。' -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host '==> npm run check' -ForegroundColor Cyan
& npm run check
Assert-Step 'check'

Write-Host '==> npm run lint' -ForegroundColor Cyan
& npm run lint
Assert-Step 'lint'

if (-not $SkipFmt) {
    Write-Host '==> npm run lint:docs:fix' -ForegroundColor Cyan
    & npm run lint:docs:fix
    Assert-Step 'lint:docs:fix'

    # --fix 会改动文件，复查一遍类型与 lint，确认它没改坏代码。
    Write-Host '==> npm run check（--fix 之后复查）' -ForegroundColor Cyan
    & npm run check
    Assert-Step 'check（复查）'

    Write-Host '==> npm run lint（--fix 之后复查）' -ForegroundColor Cyan
    & npm run lint
    Assert-Step 'lint（复查）'
}

Write-Host '提交前门禁通过。' -ForegroundColor Green
exit 0
