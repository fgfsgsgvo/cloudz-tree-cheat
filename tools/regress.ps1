# tools/regress.ps1 — cloudz 圣诞树作弊工具 · 一键回归
#
# 做法：建一张一次性测试树 → 用本地 Chrome(headless+CDP) 真页面跑三条路径 → 删树。
# 用法：
#   pwsh -File tools/regress.ps1              # 全量（用户脚本 + 可读书签 + 压缩书签）
#   pwsh -File tools/regress.ps1 -Only user   # 只跑用户脚本
#   pwsh -File tools/regress.ps1 -Only bm     # 只跑两个书签
#   pwsh -File tools/regress.ps1 -KeepQuiz    # 出问题留树排查（会打印 quiz/userKey）

param(
  [ValidateSet('all', 'user', 'bm')] [string]$Only = 'all',
  [string]$Site = 'cloudz.fun',
  [switch]$KeepQuiz
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:PYTHONIOENCODING = 'utf-8'

$py = 'python'
$results = [ordered]@{}
$mk = $null
$failed = $false

try {
  Write-Host "== 建一次性测试树（host=） ==" -ForegroundColor Cyan
  $mk = (& $py cloudz_tree_cheat.py --host $Site mkquiz --name '回归测试树') | ConvertFrom-Json
  if (-not $mk.quiz) { throw '建树失败' }
  Write-Host ("   quiz={0}  url={1}" -f $mk.quiz, $mk.url)

  if ($Only -in @('all', 'user')) {
    Write-Host "== A. 用户脚本（UI 自动爬树 + 秒过） ==" -ForegroundColor Cyan
    $json = & node tools/cdp_verify.mjs --url $mk.url --quiz $mk.quiz --timeout 120 2>$null
    $r = ($json -join "`n") | ConvertFrom-Json
    $results['user.uiClimb'] = if ($r.stages.uiClimb) { "$($r.stages.uiClimb.score)/10 top=$($r.stages.uiClimb.top)" } else { 'FAIL' }
    $results['user.instant'] = if ($r.stages.instant) { "$($r.stages.instant.score)/10" } else { 'FAIL' }
    $results['user.pass'] = $r.pass
    if (-not $r.pass) { $failed = $true }
  }

  if ($Only -in @('all', 'bm')) {
    Write-Host "== B. 书签（可读版） ==" -ForegroundColor Cyan
    $json = & node tools/cdp_bookmarklet.mjs --url $mk.url --quiz $mk.quiz --timeout 100 2>$null
    $r = ($json -join "`n") | ConvertFrom-Json
    $results['bm.look'] = if ($r.stages.look) { "$($r.stages.look.score)/10" } else { 'FAIL' }
    $results['bm.instant'] = if ($r.stages.instant) { "$($r.stages.instant.score)/10" } else { 'FAIL' }
    $results['bm.pass'] = $r.pass
    if (-not $r.pass) { $failed = $true }

    Write-Host "== C. 书签（javascript: 压缩版） ==" -ForegroundColor Cyan
    $json = & node tools/cdp_bookmarklet.mjs --url $mk.url --quiz $mk.quiz --timeout 100 `
      --look bookmarklet/a_look.min.js --instant bookmarklet/b_instant.min.js 2>$null
    $r = ($json -join "`n") | ConvertFrom-Json
    $results['bmMin.look'] = if ($r.stages.look) { "$($r.stages.look.score)/10" } else { 'FAIL' }
    $results['bmMin.instant'] = if ($r.stages.instant) { "$($r.stages.instant.score)/10" } else { 'FAIL' }
    $results['bmMin.pass'] = $r.pass
    if (-not $r.pass) { $failed = $true }
  }
}
catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  $failed = $true
}
finally {
  if ($mk -and $mk.quiz) {
    if ($KeepQuiz) {
      Write-Host "留树排查： python cloudz_tree_cheat.py --host $Site --quiz $($mk.quiz) rmquiz --user-key $($mk.userKey)" -ForegroundColor Yellow
    } else {
      Write-Host "== 清理测试树 ==" -ForegroundColor Cyan
      & $py cloudz_tree_cheat.py --host $Site --quiz $mk.quiz rmquiz --user-key $mk.userKey
    }
  }
}

Write-Host "`n== 结果 ==" -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object { "  {0,-16} {1}" -f $_.Key, $_.Value }
if ($failed) { Write-Host "`n有失败项" -ForegroundColor Red; exit 1 } else { Write-Host "`n全绿 ✔" -ForegroundColor Green; exit 0 }

