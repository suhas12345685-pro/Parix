#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PARIX_WS_PORT:-8765}"
RELAY_PORT="${PARIX_AEGIS_RELAY_PORT:-8766}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

pass() { printf '[PASS] %-20s %s\n' "$1" "${2:-}"; }
fail() { printf '[FAIL] %-20s %s\n' "$1" "${2:-}"; exit 1; }

wait_port() {
  local port="$1" deadline=$((SECONDS + ${2:-20}))
  while (( SECONDS < deadline )); do
    node -e "const net=require('net');const s=net.createConnection($port,'127.0.0.1',()=>process.exit(0));s.on('error',()=>process.exit(1));" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

send_ws_json() {
  local json="$1"
  node -e "const WebSocket=require('ws');const ws=new WebSocket('ws://localhost:${PORT}');ws.on('open',()=>{ws.send(JSON.stringify(${json}));setTimeout(()=>ws.close(),250)});ws.on('error',err=>{console.error(err.message);process.exit(1)});"
}

cd "$ROOT"
npm run build
pass build

python hands/main.py &
PIDS+=("$!")
wait_port "$PORT" 20 && pass hands-start "ws://localhost:${PORT}" || fail hands-start

node atrium/dist/index.js &
PIDS+=("$!")
sleep 3
kill -0 "${PIDS[-1]}" >/dev/null 2>&1 && pass atrium-start "pid=${PIDS[-1]}" || fail atrium-start
wait_port "$RELAY_PORT" 10 && pass aegis-relay "ws://localhost:${RELAY_PORT}" || pass aegis-relay "not open yet"

send_ws_json '{"type":"SENSOR_EVENT","event_type":"terminal_error","data":{"line":"npm ERR! missing module"},"confidence":0.95,"timestamp":0}'
send_ws_json '{"type":"SENSOR_EVENT","event_type":"file_change","data":{"path":"package.json"},"confidence":0.70,"timestamp":0}'
send_ws_json '{"type":"SILENT_INTENT_EVENT","intent_type":"idle_after_error","data":{"app":"terminal"},"confidence":0.82,"timestamp":0}'
send_ws_json '{"type":"SENSOR_EVENT","event_type":"clipboard","data":{"redacted":true},"confidence":0.65,"timestamp":0}'
send_ws_json '{"type":"SENSOR_EVENT","event_type":"schedule_tick","data":{"job":"demo"},"confidence":0.75,"timestamp":0}'
pass synthetic-events "5 sent"

integrity="$(node -e "const init=require('sql.js');const fs=require('fs');init().then(SQL=>{const db=new SQL.Database(fs.readFileSync('data/memory.db'));const s=db.prepare('PRAGMA integrity_check');s.step();console.log(s.get()[0]);})")"
[[ "$integrity" == "ok" ]] && pass sqlite-integrity "$integrity" || fail sqlite-integrity "$integrity"
