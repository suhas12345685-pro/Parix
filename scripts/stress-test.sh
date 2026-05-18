#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PARIX_WS_PORT:-8765}"
CYCLES="${CYCLES:-20}"
EVENTS_PER_CYCLE="${EVENTS_PER_CYCLE:-10}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

wait_port() {
  local port="$1" deadline=$((SECONDS + ${2:-15}))
  while (( SECONDS < deadline )); do
    node -e "const net=require('net');const s=net.createConnection($port,'127.0.0.1',()=>process.exit(0));s.on('error',()=>process.exit(1));" >/dev/null 2>&1 && return 0
    sleep 0.4
  done
  return 1
}

send_event() {
  local cycle="$1" index="$2"
  node -e "const WebSocket=require('ws');const ws=new WebSocket('ws://localhost:${PORT}');ws.on('open',()=>{ws.send(JSON.stringify({type:'SENSOR_EVENT',event_type:'stress',data:{cycle:${cycle},index:${index}},confidence:0.8,timestamp:Date.now()/1000}));setTimeout(()=>ws.close(),50)});ws.on('error',()=>process.exit(0));"
}

cd "$ROOT"
npm run build >/dev/null
python hands/main.py &
PIDS+=("$!")
wait_port "$PORT" 20

printf '{"cycles":%s,"events_per_cycle":%s,"results":[' "$CYCLES" "$EVENTS_PER_CYCLE"
for cycle in $(seq 1 "$CYCLES"); do
  start="$(node -e 'console.log(Date.now())')"
  node atrium/dist/index.js &
  atrium_pid="$!"
  sleep 2
  for idx in $(seq 1 "$EVENTS_PER_CYCLE"); do send_event "$cycle" "$idx"; done
  sleep 1
  kill "$atrium_pid" >/dev/null 2>&1 || true
  end="$(node -e 'console.log(Date.now())')"
  [[ "$cycle" -gt 1 ]] && printf ','
  printf '{"cycle":%s,"restart_ms":%s}' "$cycle" "$((end - start))"
done
integrity="$(node -e "const init=require('sql.js');const fs=require('fs');init().then(SQL=>{const db=new SQL.Database(fs.readFileSync('data/memory.db'));const s=db.prepare('PRAGMA integrity_check');s.step();console.log(s.get()[0]);})")"
printf '],"sqlite_integrity":"%s"}\n' "$integrity"
[[ "$integrity" == "ok" ]]
