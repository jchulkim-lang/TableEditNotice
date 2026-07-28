param([string]$Group = "plan")
# ============================================================
#  [프로젝트 S] SVN → 보드 목록 동기화 (탭별)
#  - 동기화_기획.bat  → 이 스크립트를 plan(기획)으로 실행
#  - 동기화_개발.bat  → 이 스크립트를 dev(개발)로 실행
#  - 사내망 PC에서 실행. 해당 SVN 경로에 접근 가능해야 합니다.
# ============================================================

# ---- 탭(그룹)별 설정 ----
$CONFIG = @{
  plan = @{ label = "기획"; base = "svn://10.10.0.251/Project_S/trunk/DataTable";                                            subdirs = @("") }
  dev  = @{ label = "개발"; base = "svn://10.10.0.251/Project_S/trunk/GameS/Plugins/VicExtension/VicExt_Game/DataTable/Enum"; subdirs = @("") }
}
$BOARD_URL  = "https://svn-table-board-s.pages.dev"   # ★ 두 번째 사이트 실제 주소로 맞추세요
$SYNC_TOKEN = "9e2c4b29625c3aaad7d54395c6521c85caa0676195b49233"

if (-not $CONFIG.ContainsKey($Group)) { Write-Host "알 수 없는 그룹: $Group (plan 또는 dev)" -ForegroundColor Red; Read-Host "엔터"; exit 1 }
$cfg = $CONFIG[$Group]
Write-Host ("[{0}] 그룹 동기화" -f $cfg.label)

# ---- svn.exe 찾기 ----
$svn = $null
$cmd = Get-Command svn -ErrorAction SilentlyContinue
if ($cmd) { $svn = $cmd.Source }
elseif (Test-Path "C:\Program Files\TortoiseSVN\bin\svn.exe")       { $svn = "C:\Program Files\TortoiseSVN\bin\svn.exe" }
elseif (Test-Path "C:\Program Files (x86)\TortoiseSVN\bin\svn.exe") { $svn = "C:\Program Files (x86)\TortoiseSVN\bin\svn.exe" }
if (-not $svn) {
  Write-Host "[오류] svn 명령(svn.exe)을 찾지 못했습니다." -ForegroundColor Red
  Write-Host "TortoiseSVN 설치 프로그램 → Modify → 'command line client tools' 를 켜서 설치 후 다시 실행하세요."
  Read-Host "엔터를 누르면 종료"; exit 1
}
Write-Host "svn 사용: $svn"

# ---- 폴더별 목록 조회(각 폴더 바로 아래) ----
$tables = @()
foreach ($sub in $cfg.subdirs) {
  if ([string]::IsNullOrEmpty($sub)) { $url = $cfg.base } else { $url = "$($cfg.base)/$sub" }
  Write-Host "조회: $url"
  $listing = & $svn list $url --non-interactive 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[경고] '$url' 조회 실패 → 건너뜁니다:" -ForegroundColor Yellow
    Write-Host ($listing -join "`n"); continue
  }
  foreach ($line in $listing) {
    $name = ($line | Out-String).Trim()
    if ($name -match '\.(xlsx|xlsm)$') {
      if ([string]::IsNullOrEmpty($sub)) { $rel = $name } else { $rel = "$sub/$name" }
      $tables += ($rel -replace '\\','/')
    }
  }
}
$tables = $tables | Sort-Object -Unique
Write-Host ("찾은 xlsx/xlsm: {0}개" -f $tables.Count)
if ($tables.Count -eq 0) { Write-Host "파일 없음. 경로/SUBDIRS 확인." -ForegroundColor Yellow; Read-Host "엔터"; exit 1 }

# ---- 업로드(해당 그룹으로) ----
$payload = @{ group = $Group; tables = @($tables); svn_repo_url = $cfg.base } | ConvertTo-Json -Depth 4
$bytes   = [System.Text.Encoding]::UTF8.GetBytes($payload)
try {
  $resp = Invoke-RestMethod -Uri "$BOARD_URL/api/tables/sync" -Method Post `
    -ContentType "application/json; charset=utf-8" `
    -Headers @{ Authorization = "Bearer $SYNC_TOKEN" } -Body $bytes -TimeoutSec 15
  Write-Host ("완료 ✅  [{0}] 보드에 {1}개 반영. $BOARD_URL" -f $cfg.label, $resp.count) -ForegroundColor Green
} catch {
  Write-Host "[오류] 업로드 실패: $($_.Exception.Message)" -ForegroundColor Red
  try { $er=$_.Exception.Response; if($er){ $sr=New-Object System.IO.StreamReader($er.GetResponseStream()); $d=$sr.ReadToEnd(); if($d){ Write-Host ("서버 응답: "+$d) -ForegroundColor Yellow } } } catch {}
  Write-Host "→ BOARD_URL, SYNC_TOKEN, D1 스키마(마이그레이션 포함)를 확인하세요."
}
if ($Host.Name -eq "ConsoleHost") { Read-Host "엔터를 누르면 종료" }
