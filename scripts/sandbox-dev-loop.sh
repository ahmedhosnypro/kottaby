#!/usr/bin/env bash
# Sandbox dev-server keep-alive loop.
#
# The 4 GB sandbox RAM is insufficient for `next dev --webpack` to compile
# large routes (admin/users SSR + Apollo + Drizzle) without hitting V8
# heap OOM. When the process dies, this wrapper revives it so that
# agent-browser / curl probes always have a warm target.
#
# Usage: PORT=3000 ./scripts/sandbox-dev-loop.sh
set -u
PORT="${PORT:-3000}"
HEAP="${NODE_OPTIONS:---max-old-space-size=2560}"
LOG="${LOG:-/home/z/my-project/dev.log}"

cd /home/z/my-project

while :; do
  echo "=== [sandbox-dev-loop] starting next dev on port $PORT ($(date -u +%FT%TZ)) ===" >> "$LOG"
  PORT="$PORT" NODE_OPTIONS="$HEAP" ./node_modules/.bin/next dev --webpack --port "$PORT" >> "$LOG" 2>&1 &
  local_pid=$!
  echo "=== [sandbox-dev-loop] pid=$local_pid ===" >> "$LOG"
  wait "$local_pid" 2>/dev/null
  ec=$?
  echo "=== [sandbox-dev-loop] pid=$local_pid exited code=$ec; reviving in 3s ($(date -u +%FT%TZ)) ===" >> "$LOG"
  sleep 3
done
