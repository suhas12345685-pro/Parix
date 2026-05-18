param(
  [int]$Cycles = 20,
  [int]$EventsPerCycle = 10,
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Results = @()
$Hands = $null

function Wait-Port($TargetPort, $Seconds = 15) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-NetConnection -ComputerName localhost -Port $TargetPort -InformationLevel Quiet) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Send-Event($Cycle, $Index) {
  $json = @{ type = "SENSOR_EVENT"; event_type = "stress"; data = @{ cycle = $Cycle; index = $Index }; confidence = 0.8; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() } | ConvertTo-Json -Compress
  $script = "const WebSocket=require('ws');const ws=new WebSocket('ws://localhost:$Port');ws.on('open',()=>{ws.send(JSON.stringify($json));setTimeout(()=>ws.close(),50)});ws.on('error',()=>process.exit(0));"
  node -e $script | Out-Null
}

try {
  Set-Location $Root
  npm run build | Out-Null
  $Hands = Start-Process python -ArgumentList @("hands/main.py") -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  if (-not (Wait-Port $Port 20)) { throw "Hands did not open port $Port" }

  for ($cycle = 1; $cycle -le $Cycles; $cycle++) {
    $start = Get-Date
    $atrium = Start-Process node -ArgumentList @("atrium/dist/index.js") -WorkingDirectory $Root -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
    for ($i = 1; $i -le $EventsPerCycle; $i++) { Send-Event $cycle $i }
    Start-Sleep -Seconds 1
    if (-not $atrium.HasExited) { Stop-Process -Id $atrium.Id -Force }
    $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
    $Results += [ordered]@{ cycle = $cycle; restart_ms = $elapsed; atrium_exited = $atrium.HasExited }
  }

  $integrity = node -e "const init=require('sql.js');const fs=require('fs');init().then(SQL=>{const db=new SQL.Database(fs.readFileSync('data/memory.db'));const s=db.prepare('PRAGMA integrity_check');s.step();console.log(s.get()[0]);})"
  $json = [ordered]@{
    cycles = $Cycles
    events_per_cycle = $EventsPerCycle
    sqlite_integrity = $integrity
    results = $Results
  } | ConvertTo-Json -Depth 5
  $json
  if ($integrity -notmatch "ok") { exit 1 }
} finally {
  if ($Hands -and -not $Hands.HasExited) { Stop-Process -Id $Hands.Id -Force -ErrorAction SilentlyContinue }
}
