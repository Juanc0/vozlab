#!/usr/bin/env bash
# Demo launcher: starts API + Web + proxy, then a Cloudflare Quick Tunnel.
# Usage: ./scripts/demo.sh
#
# Prerequisites:
#   - pnpm install done
#   - Docker compose up (postgres, redis, ollama) — or run manually
#   - cloudflared installed (see runbook-deploy.md §5)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== VozLab Demo Launcher ==="
echo ""

# 1. Start API (host process)
echo "[1/4] Starting API on :3000..."
pnpm --filter @vozlab/api dev > /tmp/vozlab-api.log 2>&1 &
API_PID=$!
sleep 8

# 2. Start Web (host process)
echo "[2/4] Starting Web on :5173..."
PUBLIC_API_BASE_URL=/api/v1 pnpm --filter @vozlab/web dev > /tmp/vozlab-web.log 2>&1 &
WEB_PID=$!
sleep 10

# 3. Start reverse proxy
echo "[3/4] Starting demo proxy on :8080..."
node scripts/demo-proxy.mjs > /tmp/vozlab-proxy.log 2>&1 &
PROXY_PID=$!
sleep 2

# Cleanup on exit
trap "kill $API_PID $WEB_PID $PROXY_PID 2>/dev/null" EXIT

# 4. Start Cloudflare Quick Tunnel
echo "[4/4] Starting Cloudflare Quick Tunnel..."
echo ""
echo "  → A public URL will appear below. Share it with anyone."
echo "  → Press Ctrl+C to stop everything."
echo ""
cloudflared tunnel --url http://localhost:8080
EOF
chmod +x /home/juan/repos/vozlab/scripts/demo.sh
echo created