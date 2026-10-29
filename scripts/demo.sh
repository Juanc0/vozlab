#!/usr/bin/env bash
# Demo launcher: exposes the local VozLab stack through three reserved zrok
# public shares (web, API and Zitadel). No reverse proxy, no Cloudflare.
#
# Usage:
#   ./scripts/demo.sh
#
# The share tokens and public URLs are read from .env (ZROK_* variables). The
# script starts the API, the PWA and the three reserved shares, and stops them
# all on Ctrl+C.
#
# zrok prerequisites (see docs/ops/runbook-demo-zrok.md):
#   - the CLI is enabled once: zrok enable <account-token>
#   - three reserved shares exist:
#       zrok reserve public --unique-name vozlabauth http://localhost:8081
#       zrok reserve public --unique-name vozlabapi  http://localhost:3000
#       zrok reserve public --unique-name vozlabdemo http://localhost:5173
#   - .env has ZROK_AUTH_SHARE_TOKEN, ZROK_API_SHARE_TOKEN and
#     ZROK_WEB_SHARE_TOKEN (plus the matching ZROK_*_URL values)
#   - Zitadel is running with its public auth origin and the OIDC app has the
#     public callback registered (./scripts/setup-zitadel.sh with ZITADEL_PUBLIC_URL)
#
# Other requirements:
#   - pnpm install done
#   - Docker compose up (postgres, redis, ollama, and the idp profile for Zitadel)
#   - ports 3000 and 5173 free (the script refuses to start over them)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Read a single key from .env without sourcing it: the file is dotenv syntax,
# not shell (values such as OIDC_SCOPES contain spaces and are not quoted).
read_env() {
  local key="$1" line value
  [ -f .env ] || return 0
  line=$(grep -m1 -E "^${key}=" .env 2>/dev/null || true)
  [ -n "$line" ] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value:1:${#value}-2}" ;;
    \'*\') value="${value:1:${#value}-2}" ;;
  esac
  printf '%s' "$value"
}

ZROK_WEB_URL="${ZROK_WEB_URL:-$(read_env ZROK_WEB_URL)}"
ZROK_API_URL="${ZROK_API_URL:-$(read_env ZROK_API_URL)}"
ZROK_AUTH_URL="${ZROK_AUTH_URL:-$(read_env ZROK_AUTH_URL)}"
ZROK_WEB_SHARE_TOKEN="${ZROK_WEB_SHARE_TOKEN:-$(read_env ZROK_WEB_SHARE_TOKEN)}"
ZROK_API_SHARE_TOKEN="${ZROK_API_SHARE_TOKEN:-$(read_env ZROK_API_SHARE_TOKEN)}"
ZROK_AUTH_SHARE_TOKEN="${ZROK_AUTH_SHARE_TOKEN:-$(read_env ZROK_AUTH_SHARE_TOKEN)}"

ZROK_WEB_URL="${ZROK_WEB_URL:-https://vozlabdemo.share.zrok.io}"
ZROK_API_URL="${ZROK_API_URL:-https://vozlabapi.share.zrok.io}"
ZROK_AUTH_URL="${ZROK_AUTH_URL:-https://vozlabauth.share.zrok.io}"

# `zrok share reserved` takes the share NAME (vozlabdemo/vozlabapi/vozlabauth),
# not the internal zId. The overview lists both. Read from .env when not set.
ZROK_WEB_SHARE_TOKEN_NAME="${ZROK_WEB_SHARE_TOKEN_NAME:-$(read_env ZROK_WEB_SHARE_TOKEN_NAME)}"
ZROK_API_SHARE_TOKEN_NAME="${ZROK_API_SHARE_TOKEN_NAME:-$(read_env ZROK_API_SHARE_TOKEN_NAME)}"
ZROK_AUTH_SHARE_TOKEN_NAME="${ZROK_AUTH_SHARE_TOKEN_NAME:-$(read_env ZROK_AUTH_SHARE_TOKEN_NAME)}"
ZROK_WEB_SHARE_TOKEN_NAME="${ZROK_WEB_SHARE_TOKEN_NAME:-vozlabdemo}"
ZROK_API_SHARE_TOKEN_NAME="${ZROK_API_SHARE_TOKEN_NAME:-vozlabapi}"
ZROK_AUTH_SHARE_TOKEN_NAME="${ZROK_AUTH_SHARE_TOKEN_NAME:-vozlabauth}"

: "${ZROK_WEB_SHARE_TOKEN_NAME:?set ZROK_WEB_SHARE_TOKEN_NAME in .env (see docs/ops/runbook-demo-zrok.md)}"
: "${ZROK_API_SHARE_TOKEN_NAME:?set ZROK_API_SHARE_TOKEN_NAME in .env (see docs/ops/runbook-demo-zrok.md)}"
: "${ZROK_AUTH_SHARE_TOKEN_NAME:?set ZROK_AUTH_SHARE_TOKEN_NAME in .env (see docs/ops/runbook-demo-zrok.md)}"

PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

port_busy() {
  ss -tln 2>/dev/null | grep -q ":$1 "
}

for port in 3000 5173; do
  if port_busy "$port"; then
    echo "ERROR: port $port is already in use. Stop the running process first." >&2
    echo "       (ss -tlnp | grep ':$port' shows the owner)" >&2
    exit 1
  fi
done

echo "=== VozLab Demo Launcher (zrok) ==="
echo ""

# 1. Start API (host process). It reads .env itself.
echo "[1/3] Starting API on :3000..."
pnpm --filter @vozlab/api dev > /tmp/vozlab-api.log 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:3000/health 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS -o /dev/null http://localhost:3000/health ||
  { echo "ERROR: the API did not become healthy. See /tmp/vozlab-api.log" >&2; exit 1; }

# 2. Start Web (host process) — the PWA calls the public API share directly.
echo "[2/3] Starting Web on :5173..."
PUBLIC_API_BASE_URL="${ZROK_API_URL}/api/v1" \
  pnpm --filter @vozlab/web dev -- --host 0.0.0.0 > /tmp/vozlab-web.log 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:5173/ 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS -o /dev/null http://localhost:5173/ ||
  { echo "ERROR: the web dev server did not start. See /tmp/vozlab-web.log" >&2; exit 1; }

# 3. Start the three reserved zrok shares.
echo "[3/3] Starting reserved zrok shares..."
zrok share reserved "$ZROK_AUTH_SHARE_TOKEN_NAME" --headless \
  > /tmp/vozlab-zrok-auth.log 2>&1 &
PIDS+=("$!")
zrok share reserved "$ZROK_API_SHARE_TOKEN_NAME" --headless \
  > /tmp/vozlab-zrok-api.log 2>&1 &
PIDS+=("$!")
zrok share reserved "$ZROK_WEB_SHARE_TOKEN_NAME" --headless \
  > /tmp/vozlab-zrok-web.log 2>&1 &
PIDS+=("$!")

echo ""
echo "  → Web:  $ZROK_WEB_URL"
echo "  → API:  $ZROK_API_URL"
echo "  → Auth: $ZROK_AUTH_URL"
echo "  → Logs: /tmp/vozlab-{api,web,zrok-auth,zrok-api,zrok-web}.log"
echo "  → Press Ctrl+C to stop everything."
wait
