# tools/regress.ps1 — cloudz 圣诞树工具 · 回归（对着你给的一张真实答题页跑）
#
# 现在工具里不再有「用题库自建测试树」的功能，所以回归要你提供一张页面：
#   pwsh -File tools/regress.ps1 -Url "https://cloudz.fun/tree/f/<id>"
#   pwsh -File tools/regress.ps1 -Url "https://c.cloudz.fun/tree/cn/visit?id=<id>" -Only bm
#
# 注意：回归会真的开局答题并提交一次成绩（榜上会留名），所以别拿别人的树跑；
#       最好用自己建的树，跑完自己删。

param(
  [Parameter(Mandatory = $true)] [string]$Url,
  [ValidateSet('all', 'user', 'bm')] [string]$Only = 'all'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:PYTHONIOENCODING = 'utf-8'

if ($Url -notmatch '([?&]id=|/tree/f/)([A-Za-z0-9]+)') {
  Write-Host "链接里找不到树 id：$Url" -ForegroundColor Red
  exit 2
}
$quiz = $Matches[2]
Write-Host "目标：$Url" -ForegroundColor Cyan
Write-Host "quiz=$quiz" -ForegroundColor DarkGray
Write-Host "提示：会提交一次成绩（名字由测试固定），跑完可自行删掉那条记录" -ForegroundColor Yellow

$results = [ordered]@{}
$failed = $false

function Run-Test($label, $script, [string[]]$extra) {
  Write-Host "== $label ==" -ForegroundColor Cyan
  $json = & node $script --url $Url --quiz $quiz @extra 2>$null
  try {
    $r = ($json -join "`n") | ConvertFrom-Json
  } catch {
    $results[$label] = 'FAIL(no json)'
    $script:failed = $true
    return
  }
  $results[$label] = if ($r.pass) { 'pass' } else { 'FAIL' }
  if (-not $r.pass) { $script:failed = $true }
  $json | Out-String | Write-Verbose
}

try {
  if ($Only -in @('all', 'user')) { Run-Test 'userscript(ui+instant)' 'tools/cdp_verify.mjs' @('--timeout', '120') }
  if ($Only -in @('all', 'bm')) {
    Run-Test 'bookmarklet(readable)' 'tools/cdp_bookmarklet.mjs' @('--timeout', '100')
    Run-Test 'bookmarklet(min)' 'tools/cdp_bookmarklet.mjs' @('--timeout', '100', '--look', 'bookmarklet/a_look.min.js', '--instant', 'bookmarklet/b_instant.min.js')
  }
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  $failed = $true
}

Write-Host "`n== 结果 ==" -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object { "  {0,-22} {1}" -f $_.Key, $_.Value }
if ($failed) { Write-Host "`n有失败项" -ForegroundColor Red; exit 1 }
Write-Host "`n全绿 ✔" -ForegroundColor Green
exit 0
