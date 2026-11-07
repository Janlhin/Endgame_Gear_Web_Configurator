#requires -Version 7.4
<#
.SYNOPSIS
    项目文档的结构校验：五件套齐、AGENTS.md 不超行数、相对链接可达。

.DESCRIPTION
    规范《用 AI 做项目：强制工程校验规范》§文档先行 的第一层「结构可校验」：
      1. 五个文档存在；
      2. AGENTS.md 是目录不是手册（≤150 行）；
      3. Markdown 里的相对链接全部可达（断链即失败）。

    只校验**仓库内**的相对链接与文件路径。外部 URL 不校验可达性——本机网络下
    markdown-link-check 会把真实存在的站点判为死链（504/403），那属于噪音而不是缺陷；
    外链复核靠人工与 MANIFEST.md 登记。

    扫描范围只覆盖**本仓库跟踪的 Markdown**：伞形仓库里可能嵌着别的独立仓库，
    虚拟环境里的第三方文档更不属于本仓库 —— 把它们算进来只会制造假断链。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/check-docs.ps1
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$problems = [System.Collections.Generic.List[string]]::new()
function Add-Problem { param([string]$Message) $problems.Add($Message) }

Write-Host "文档结构检查：$RepoRoot" -ForegroundColor Cyan

# ---------------------------------------------------------- 五件套
$required = @('README.md', 'AGENTS.md', 'DECISIONS.md', 'TASKS.md', 'MANIFEST.md')
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $RepoRoot $_)) })
if ($missing.Count -gt 0) {
    Add-Problem "缺少项目文档：$($missing -join ', ')"
}
else {
    Write-Host '  [OK] 五件套齐' -ForegroundColor DarkGreen
}

# ---------------------------------------------------------- AGENTS.md 行数
$agentsPath = Join-Path $RepoRoot 'AGENTS.md'
if (Test-Path -LiteralPath $agentsPath) {
    $lines = (Get-Content -LiteralPath $agentsPath).Count
    if ($lines -gt 150) {
        Add-Problem "AGENTS.md 有 $lines 行，超过 150 行上限（规范 §agents-md：它是目录，不是手册）"
    }
    else {
        Write-Host "  [OK] AGENTS.md $lines 行（≤150）" -ForegroundColor DarkGreen
    }
}

# ---------------------------------------------------------- 相对链接
function Get-TrackedFiles {
    param([string]$Path)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return @() }
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'git'
    $psi.Arguments = '-c core.quotepath=false ls-files --cached --others --exclude-standard "*.md"'
    $psi.WorkingDirectory = $Path
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $psi.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $process = [System.Diagnostics.Process]::Start($psi)
    $output = $process.StandardOutput.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { return @() }
    return @($output -split "`r?`n" | Where-Object { $_ })
}

$mdFiles = @()
Push-Location $RepoRoot
try {
    $trackedMd = @(Get-TrackedFiles -Path $RepoRoot)
    if ($trackedMd.Count -gt 0) {
        $mdFiles = @(
            $trackedMd |
                ForEach-Object { Join-Path $RepoRoot $_ } |
                ForEach-Object { if (Test-Path -LiteralPath $_) { Get-Item -LiteralPath $_ } }
        )
    }
    else {
        $mdFiles = @(
            Get-ChildItem -Path $RepoRoot -Recurse -Filter '*.md' -File |
                Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|\.venv|venv_build|\.workbuddy)[\\/]' }
        )
    }
}
finally { Pop-Location }

$linkPattern = '\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)'
# 只把「看起来像路径」的目标当链接：含扩展名、或以 ./ ../ 开头。
# 否则像 `[字段](bm,name,note1)` 这类字段列表会被误判为断链。
$pathLike = '\.[A-Za-z0-9]{1,6}$|^[./\\]'
$broken = @()
foreach ($file in $mdFiles) {
    $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $text) { continue }
    $relative = $file.FullName.Substring($RepoRoot.Length + 1)
    foreach ($match in [regex]::Matches($text, $linkPattern)) {
        $target = $match.Groups[1].Value
        if ($target -match '^(https?:|mailto:|#)') { continue }
        $target = ($target -split '#')[0]
        if (-not $target) { continue }
        if ($target -notmatch $pathLike) { continue }
        $resolved = Join-Path (Split-Path -Parent $file.FullName) $target
        if (-not (Test-Path -LiteralPath $resolved)) {
            $broken += "$relative -> $target"
        }
    }
}
if ($broken.Count -gt 0) {
    foreach ($item in $broken) { Add-Problem "断链：$item" }
}
else {
    Write-Host "  [OK] $($mdFiles.Count) 个 Markdown 的相对链接全部可达" -ForegroundColor DarkGreen
}

# ---------------------------------------------------------- 结论
Write-Host ''
if ($problems.Count -gt 0) {
    Write-Host "文档结构检查未通过，共 $($problems.Count) 项：" -ForegroundColor Red
    foreach ($problem in $problems) { Write-Host "  - $problem" -ForegroundColor Red }
    exit 1
}
Write-Host '文档结构检查通过。' -ForegroundColor Green
exit 0
