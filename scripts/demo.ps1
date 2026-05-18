param(
  [int]$Port = 8765,
  [int]$RelayPort = 8766,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Summary = [ordered]@{}
$Processes = @()

function Add-Result($Name, $Pass, $Detail = "") {
  $Summary[$Name] = [ordered]@{ pass = [bool]$Pass; detail = $Detail }
  $mark = if ($Pass) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} {2}" -f $mark, $Name, $Detail)
}

function Wait-Port($TargetPort, $Seconds = 20) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Test-NetConnection -ComputerName "localhost" -Port $TargetPort -InformationLevel Quiet)) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Send-WsJson($Json) {
  $script = @"
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:$Port');
ws.on('open', () => { ws.send(JSON.stringify($Json)); setTimeout(() => ws.close(), 250); });
ws.on('error', err => { console.error(err.message); process.exit(1); });
"@
  node -e $script
}

try {
  Set-Location $Root
  if (-not $SkipBuild) {
    npm run build | Out-Host
    Add-Result "build" $true
  }

  $hands = Start-Process -FilePath "python" -ArgumentList @("hands/main.py") -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  $Processes += $hands
  Add-Result "hands-start" (Wait-Port $Port 20) "ws://localhost:$Port"

  $atrium = Start-Process -FilePath "node" -ArgumentList @("atrium/dist/index.js") -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  $Processes += $atrium
  Start-Sleep -Seconds 3
  Add-Result "atrium-start" (-not $atrium.HasExited) "pid=$($atrium.Id)"
  Add-Result "aegis-relay" (Wait-Port $RelayPort 10) "ws://localhost:$RelayPort"

  $events = @(
    @{ type = "SENSOR_EVENT"; event_type = "terminal_error"; data = @{ line = "npm ERR! missing module" }; confidence = 0.95; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() },
    @{ type = "SENSOR_EVENT"; event_type = "file_change"; data = @{ path = "package.json" }; confidence = 0.70; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() },
    @{ type = "SILENT_INTENT_EVENT"; intent_type = "idle_after_error"; data = @{ app = "terminal" }; confidence = 0.82; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() },
    @{ type = "SENSOR_EVENT"; event_type = "clipboard"; data = @{ redacted = $true }; confidence = 0.65; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() },
    @{ type = "SENSOR_EVENT"; event_type = "schedule_tick"; data = @{ job = "demo" }; confidence = 0.75; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
  )
  foreach ($event in $events) {
    Send-WsJson ($event | ConvertTo-Json -Compress -Depth 6)
  }
  Start-Sleep -Seconds 2
  Add-Result "synthetic-events" $true "$($events.Count) sent"

  $integrity = node -e "const init=require('sql.js');const fs=require('fs');init().then(SQL=>{const db=new SQL.Database(fs.readFileSync('data/memory.db'));const s=db.prepare('PRAGMA integrity_check');s.step();console.log(s.get()[0]);})"
  Add-Result "sqlite-integrity" ($integrity -match "ok") $integrity

  Write-Host "`nSummary"
  $Summary.GetEnumerator() | ForEach-Object {
    "{0,-20} {1} {2}" -f $_.Key, $(if ($_.Value.pass) { "PASS" } else { "FAIL" }), $_.Value.detail
  }
  $failed = $Summary.Values | Where-Object { -not $_.pass }
  if ($failed.Count -gt 0) { exit 1 }
} finally {
  foreach ($proc in $Processes) {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
