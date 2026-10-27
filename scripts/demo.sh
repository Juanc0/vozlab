#!/usr/bin/env bash
# Demo launcher: starts API + Web + proxy, then a public tunnel.
#
# Usage:
#   ./scripts/demo.sh                    # Cloudflare Quick Tunnel (ephemeral URL)
#   DEMO_TUNNEL=zrok ./scripts/demo.sh   # reserved zrok shares (stable URLs)
#
# zrok prerequisites (see docs/runbook-demo-zrok.md):
#   - the CLI is enabled once: zrok enable <account-token>
#   - reserved shares exist:
#       zrok reserve public --unique-name vozlabauth http://localhost:8081
#       zrok reserve public --unique-name vozlabdemo http://localhost:8080
#   - export ZROK_AUTH_SHARE_TOKEN=<token>
#   - export ZROK_DEMO_SHARE_TOKEN=<token>
#   - Zitadel is running with its public auth origin and the OIDC app has the
#     public callback registered (./scripts/setup-zitadel.sh with ZITADEL_PUBLIC_URL)
#
# Other requirements:
#   - pnpm install done
#   - Docker compose up (postgres, redis, ollama, and the idp profile for Zitadel)
#   - cloudflared installed when DEMO_TUNNEL=cloudflare (the default)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TUNNEL="${DEMO_TUNNEL:-cloudflare}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

echo "=== VozLab Demo Launcher ==="
echo ""

# 1. Start API (host process)
echo "[1/4] Starting API on :3000..."
pnpm --filter @vozlab/api dev > /tmp/vozlab-api.log 2>&1 &
PIDS+=("$!")
sleep 8

# 2. Start Web (host process)
echo "[2/4] Starting Web on :5173..."
PUBLIC_API_BASE_URL=/api/v1 pnpm --filter @vozlab/web dev > /tmp/vozlab-web.log 2>&1 &
PIDS+=("$!")
sleep 10

# 3. Start reverse proxy
echo "[3/4] Starting demo proxy on :8080..."
node scripts/demo-proxy.mjs > /tmp/vozlab-proxy.log 2>&1 &
PIDS+=("$!")
sleep 2

# 4. Start the public tunnel
case "$TUNNEL" in
  zrok)
    echo "[4/4] Starting reserved zrok shares..."
    : "${ZROK_AUTH_SHARE_TOKEN:?set ZROK_AUTH_SHARE_TOKEN (see docs/runbook-demo-zrok.md)}"
    : "${ZROK_DEMO_SHARE_TOKEN:?set ZROK_DEMO_SHARE_TOKEN (see docs/runbook-demo-zrok.md)}"
    zrok share reserved "$ZROK_AUTH_SHARE_TOKEN" --headless \
      > /tmp/vozlab-zrok-auth.log 2>&1 &
    PIDS+=("$!")
    zrok share reserved "$ZROK_DEMO_SHARE_TOKEN" --headless \
      > /tmp/vozlab-zrok-demo.log 2>&1 &
    PIDS+=("$!")
    echo ""
    echo "  → Web/API: ${ZROK_WEB_URL:-https://vozlabdemo.share.zrok.io}"
    echo "  → Auth:    ${ZROK_AUTH_URL:-https://vozlabauth.share.zrok.io}"
    echo "  → Press Ctrl+C to stop everything."
    wait
    ;;
  cloudflare)
    echo "[4/4] Starting Cloudflare Quick Tunnel..."
    echo ""
    echo "  → A public URL will appear below. Share it with anyone."
    echo "  → Press Ctrl+C to stop everything."
    echo ""
    cloudflared tunnel --url http://localhost:8080
    ;;
  *)
    echo "ERROR: unknown DEMO_TUNNEL='$TUNNEL' (use 'cloudflare' or 'zrok')" >&2
    exit 2
    ;;
esac
