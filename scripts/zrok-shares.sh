#!/usr/bin/env bash
# Start/stop the three reserved zrok shares used by the public demo.
#
#   ./scripts/zrok-shares.sh start    # start the ones that are not running
#   ./scripts/zrok-shares.sh stop     # stop all of them
#   ./scripts/zrok-shares.sh status   # show PID + public URL per share
#
# Each share is `zrok share reserved <token> --headless`, which proxies a
# public HTTPS hostname to a local port. A reserved share that exists but is
# not shared answers 502 Bad Gateway from the zrok edge — that is the failure
# this script prevents.
#
# Shares (token -> local target), per docs/ops/runbook-demo-zrok.md:
#   vozlabauth -> http://127.0.0.1:8081   (Zitadel)
#   vozlabapi  -> http://127.0.0.1:3000   (Fastify API)
#   vozlabdemo -> http://127.0.0.1:5173   (SvelteKit PWA)
#
# Logs and pidfiles live under .zrok/ (gitignored).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATE_DIR="$ROOT/.zrok"
mkdir -p "$STATE_DIR"

SHARES="vozlabauth:8081 vozlabapi:3000 vozlabdemo:5173"

action="${1:-status}"

if ! command -v zrok >/dev/null 2>&1; then
  echo "zrok-shares: the zrok CLI is not on PATH; install it or skip the demo mode" >&2
  exit 1
fi

pidfile() { echo "$STATE_DIR/$1.pid"; }
logfile() { echo "$STATE_DIR/$1.log"; }

is_running() {
  local pf; pf=$(pidfile "$1")
  [ -f "$pf" ] || return 1
  local pid; pid=$(cat "$pf" 2>/dev/null)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_share() {
  local token="$1" port="$2"
  if is_running "$token"; then
    echo "   $token: already sharing (pid $(cat "$(pidfile "$token")"))"
    return 0
  fi
  # A stale pidfile (process gone) is replaced below.
  rm -f "$(pidfile "$token")"
  # --override-endpoint pins the backend target: a reservation can carry a
  # stale or IPv6-only endpoint, and a mismatch surfaces as 502 at the edge.
  nohup zrok share reserved "$token" --headless \
    --override-endpoint "http://127.0.0.1:$port" \
    >"$(logfile "$token")" 2>&1 &
  local pid=$!
  echo "$pid" >"$(pidfile "$token")"
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    echo "   $token: sharing -> 127.0.0.1:$port (pid $pid)"
  else
    echo "   $token: FAILED to start — see $(logfile "$token")" >&2
    rm -f "$(pidfile "$token")"
    return 1
  fi
}

stop_share() {
  local token="$1"
  local pf; pf=$(pidfile "$token")
  if [ -f "$pf" ]; then
    local pid; pid=$(cat "$pf" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "   $token: stopped (pid $pid)"
    fi
    rm -f "$pf"
  else
    # Also catch shares started outside this script.
    if pkill -f "zrok share reserved $token" 2>/dev/null; then
      echo "   $token: stopped (external process)"
    fi
  fi
}

case "$action" in
  start)
    echo "==> zrok shares"
    rc=0
    for entry in $SHARES; do
      start_share "${entry%%:*}" "${entry##*:}" || rc=1
    done
    exit $rc
    ;;
  stop)
    echo "==> stopping zrok shares"
    for entry in $SHARES; do
      stop_share "${entry%%:*}"
    done
    ;;
  status)
    for entry in $SHARES; do
      token="${entry%%:*}"; port="${entry##*:}"
      if is_running "$token"; then
        echo "$token  running  pid $(cat "$(pidfile "$token")")  -> 127.0.0.1:$port"
      else
        echo "$token  stopped  (would proxy 127.0.0.1:$port)"
      fi
    done
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
