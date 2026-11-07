#requires -Version 7.4
<#
.SYNOPSIS
    界面演练：布局裁剪 / 语言检测 / 渲染 / 复位。

.DESCRIPTION
    五个 python 脚本原先以 `&&` 串在 package.json 的 check:ui 里，属 cmd 专有语法
    （规范 §脚本执行基线）。改由本脚本串联，package.json 只做转发。

    依赖 Windows 上预装的 msedge.exe 与 python；CI 只在 windows-latest 上跑这一段。
    Windows runner 的默认控制台编码是 GBK，而这几个脚本会打印中 / 日 / 韩文断言结果，
    所以这里强制 Python 走 UTF-8 —— 只改运行环境，不动脚本逻辑。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/check-ui.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

foreach ($script in @('re/layout_check.py', 're/i18n_check.py', 're/render_check.py', 're/reset_check.py', 're/xm1_align_check.py')) {
    if (-not (Test-Path -LiteralPath $script)) {
        throw "找不到 $script。界面演练的脚本清单变了？先同步本文件。"
    }
    Write-Host "==> python $script" -ForegroundColor Cyan
    & python $script
    if ($LASTEXITCODE -ne 0) {
        Write-Host "界面演练失败：$script（退出码 $LASTEXITCODE）" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host '界面演练通过。' -ForegroundColor Green
exit 0
