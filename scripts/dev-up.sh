#!/usr/bin/env bash
# One-command dev bootstrap for VozLab.
#
# Usage:
#   ./scripts/dev-up.sh            # local dev  (localhost URLs)
#   ./scripts/dev-up.sh demo       # public demo (zrok shares)
#
# Each mode has its OWN Zitadel instance + DB volume, so switching modes
# does NOT destroy data — it just stops one and starts the other (~5s).
# The API/web are NOT started (they need a tty for logs); copy-paste the
# printed commands. They read OIDC_* from .env (demo) or .env.local (local).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="local"
RESET=0
for arg in "$@"; do
  case "$arg" in
    demo)   MODE="demo" ;;
    --reset) RESET=1 ;;
    *) echo "unknown arg: $arg (use: demo, --reset)" >&2; exit 2 ;;
  esac
done

ENV_FILE=".env.local"
PROJECT="vozlab-zitadel-local"
if [ "$MODE" = "demo" ]; then
  ENV_FILE=".env"
  PROJECT="vozlab-zitadel-demo"
fi

# --- 0. Load env ------------------------------------------------------------
# env.sh sources the file with `set -a`, so every value in it is exported —
# including mode-scoped ones left over from the other mode. Snapshot the
# caller's explicit overrides first, source, then drop the file's copies: the
# mode chosen on the command line wins over the file, and a real shell
# override still wins over the mode.
_MODE_SCOPED="ZITADEL_PUBLIC_URL API_CALLBACK WEB_ORIGIN ZITADEL_EXTERNALDOMAIN ZITADEL_EXTERNALPORT ZITADEL_EXTERNALSECURE ZITADEL_URL ZITADEL_ADMIN_USERNAME ZITADEL_MASTERKEY"
# Indirect expansion, never eval: a value containing a space or a quote must
# not be re-parsed as shell code.
for _v in $_MODE_SCOPED; do printf -v "_ov_${_v}" '%s' "${!_v-}"; done
source scripts/env.sh "$MODE" 2>/dev/null || true
for _v in $_MODE_SCOPED; do
  _ovname="_ov_${_v}"
  unset "$_v"
  if [ -n "${!_ovname-}" ]; then export "$_v=${!_ovname}"; fi
done
for _v in $_MODE_SCOPED; do _ovname="_ov_${_v}"; unset "$_ovname"; done
unset _v _ovname _MODE_SCOPED

# --- 1. Base stack ----------------------------------------------------------
echo "==> base stack (postgres, redis, ollama)"
docker compose up -d --build postgres redis ollama

# Bootstrap dir (per-mode, so local and demo PATs never collide).
# The Zitadel container runs as root and writes the PATs as root:root, mode
# 0644 — a world-readable admin token on the host. The directory is the access
# boundary, so keep it owner-only; the container bypasses it as root.
BOOTSTRAP_DIR="$ROOT/.zitadel-bootstrap-$MODE"
mkdir -p "$BOOTSTRAP_DIR"
chmod 700 "$BOOTSTRAP_DIR"
export ZITADEL_BOOTSTRAP_DIR="$BOOTSTRAP_DIR"

# Mode-specific public URLs (needed by both the live probe and provisioning)
if [ "$MODE" = "demo" ]; then
  export ZITADEL_PUBLIC_URL="${ZITADEL_PUBLIC_URL:-https://vozlabauth.share.zrok.io}"
  export API_CALLBACK="${API_CALLBACK:-https://vozlabapi.share.zrok.io/api/v1/auth/callback}"
  export WEB_ORIGIN="${WEB_ORIGIN:-https://vozlabdemo.share.zrok.io}"
  ADMIN_LOGIN="${ZITADEL_ADMIN_USERNAME:-zitadel-admin}@zitadel.${ZITADEL_EXTERNALDOMAIN:-vozlabauth.share.zrok.io}"
else
  export ZITADEL_PUBLIC_URL="${ZITADEL_PUBLIC_URL:-http://localhost:8081}"
  export API_CALLBACK="${API_CALLBACK:-http://localhost:3000/api/v1/auth/callback}"
  export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"
  ADMIN_LOGIN="${ZITADEL_ADMIN_USERNAME:-zitadel-admin}@zitadel.${ZITADEL_EXTERNALDOMAIN:-localhost}"
fi
export ZITADEL_URL="${ZITADEL_URL:-http://localhost:8081}"

# --- 2a. Reset Zitadel (destroy DB + PAT, re-init from scratch) -------------
if [ "$RESET" -eq 1 ]; then
  echo "==> RESET: destroying Zitadel DB + PAT for $MODE"
  docker compose -p "$PROJECT" -f docker/identity-lab/zitadel/compose.yml down 2>/dev/null || true
  docker volume rm "${PROJECT}_zitadel-db-data" 2>/dev/null || true
  rm -rf "$BOOTSTRAP_DIR" && mkdir -p "$BOOTSTRAP_DIR" && chmod 700 "$BOOTSTRAP_DIR"
  echo "   Zitadel DB + PAT cleared for $MODE"
fi

# --- 2. Switch Zitadel instance --------------------------------------------
OTHER_PROJECT="vozlab-zitadel-demo"
[ "$MODE" = "demo" ] && OTHER_PROJECT="vozlab-zitadel-local"

# Stop the other instance if running (keep its data volume)
if docker compose -p "$OTHER_PROJECT" -f docker/identity-lab/zitadel/compose.yml ps -q 2>/dev/null | grep -q .; then
  echo "==> stopping the other Zitadel instance ($OTHER_PROJECT)"
  docker compose -p "$OTHER_PROJECT" -f docker/identity-lab/zitadel/compose.yml down
fi

# External domain config per mode
if [ "$MODE" = "demo" ]; then
  export ZITADEL_EXTERNALDOMAIN="${ZITADEL_EXTERNALDOMAIN:-vozlabauth.share.zrok.io}"
  export ZITADEL_EXTERNALPORT="${ZITADEL_EXTERNALPORT:-443}"
  export ZITADEL_EXTERNALSECURE="${ZITADEL_EXTERNALSECURE:-true}"
else
  export ZITADEL_EXTERNALDOMAIN="${ZITADEL_EXTERNALDOMAIN:-localhost}"
  export ZITADEL_EXTERNALPORT="${ZITADEL_EXTERNALPORT:-8081}"
  export ZITADEL_EXTERNALSECURE="${ZITADEL_EXTERNALSECURE:-false}"
fi
export ZITADEL_MASTERKEY="${ZITADEL_MASTERKEY:-MasterkeyNeedsToHave32Characters}"

echo "==> zitadel ($MODE, project: $PROJECT)"
docker compose -p "$PROJECT" -f docker/identity-lab/zitadel/compose.yml up -d
until curl -fsS -o /dev/null http://localhost:8081/debug/ready; do sleep 2; done

# The external domain is baked into the instance at first init: Zitadel derives
# the issuer from it and the seeded admin login embeds it. A run that asks for
# a different domain leaves a login that cannot work, so read the LIVE issuer
# (not a stamp of what we intended) and stop before provisioning against it.
_issuer() {
  curl -fsS http://localhost:8081/.well-known/openid-configuration 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("issuer",""))' 2>/dev/null \
    || true
}
LIVE_HOST=$(printf '%s' "$(_issuer)" \
  | python3 -c 'import sys,urllib.parse as u; print(u.urlparse(sys.stdin.read().strip()).hostname or "")' 2>/dev/null \
  || true)
if [ -n "$LIVE_HOST" ] && [ "$LIVE_HOST" != "$ZITADEL_EXTERNALDOMAIN" ] && [ "$RESET" -ne 1 ]; then
  echo "!! The $MODE Zitadel instance reports issuer host '$LIVE_HOST'," >&2
  echo "   but this run wants '$ZITADEL_EXTERNALDOMAIN'." >&2
  echo "   Zitadel fixes the external domain at first init (issuer + admin login)," >&2
  echo "   so OIDC would hand out tokens the API rejects." >&2
  echo "   Apply the change with:" >&2
  echo "     ./scripts/dev-up.sh $MODE --reset" >&2
  echo "   That destroys the $MODE Zitadel database and re-provisions OIDC." >&2
  exit 1
fi
# Fail closed: an instance that already has a PAT was initialised, so an
# unreadable issuer is a real problem, not a first-boot race.
if [ -z "$LIVE_HOST" ] && [ -f "$BOOTSTRAP_DIR/admin.pat" ] && [ "$RESET" -ne 1 ]; then
  echo "!! Could not read the issuer from the running $MODE instance." >&2
  echo "   It is already provisioned, so this is not a first boot." >&2
  echo "   Check it with: curl http://localhost:8081/.well-known/openid-configuration" >&2
  echo "   Or start over with: ./scripts/dev-up.sh $MODE --reset" >&2
  exit 1
fi

# --- 3. Provision (verify against the LIVE instance, not just the PAT file) --
# A PAT left on the host survives `docker volume rm`: the file exists while
# the database that honoured it is gone. So ask Zitadel whether OUR project
# still exists before deciding to skip provisioning.
PAT_FILE="$BOOTSTRAP_DIR/admin.pat"

zitadel_has_project() {
  [ -f "$PAT_FILE" ] || return 1
  local pat host body code
  pat=$(cat "$PAT_FILE")
  # Zitadel resolves the instance from the Host header; management calls to
  # localhost must carry the public host when an external domain is set.
  host=$(python3 -c 'import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).netloc)' \
    "${ZITADEL_PUBLIC_URL:-http://localhost:8081}" 2>/dev/null || echo "localhost:8081")
  # Body and status in one variable: a temp file would leak on any interrupt
  # between its creation and the cleanup.
  body=$(curl -s -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $pat" -H "Content-Type: application/json" \
    -H "Host: $host" -d '{}' \
    "http://localhost:8081/management/v1/projects/_search" 2>/dev/null \
    || printf '\n000')
  code=${body##*$'\n'}
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"name":"vozlab"'; then
    return 0
  fi
  return 1
}

if ! zitadel_has_project; then
  echo "==> provisioning OIDC client + test user for $MODE"
  export ZITADEL_CONTAINER="${PROJECT}-zitadel-1"
  PROV_OUT=$(mktemp)
  ZITADEL_URL="$ZITADEL_URL" ZITADEL_PUBLIC_URL="$ZITADEL_PUBLIC_URL" \
    API_CALLBACK="$API_CALLBACK" WEB_ORIGIN="$WEB_ORIGIN" \
    ./scripts/setup-zitadel.sh 2>&1 | tee "$PROV_OUT" | tail -20
  echo

  # Auto-patch env file with OIDC_* values (no copy-paste)
  echo "==> patching $ENV_FILE with OIDC_* values"
  python3 - "$PROV_OUT" "$ENV_FILE" <<'PYINNER'
import os, sys
prov_path, env_path = sys.argv[1], sys.argv[2]
text = open(prov_path).read()
start = text.index("=== .env (OIDC) ===")
end = text.index("=== Test user ===")
block = text[start:end].replace("=== .env (OIDC) ===", "").strip()
lines = open(env_path).read().splitlines() if os.path.exists(env_path) else []
keep = [l for l in lines
        if not l.strip().startswith("OIDC_")
        and not l.strip().startswith("WEB_ORIGIN=")
        and not l.strip().startswith("PUBLIC_API_BASE_URL=")]
while keep and not keep[-1].strip():
    keep.pop()
marker_start = "# >>> ZITADEL OIDC (auto-generated by dev-up.sh) >>>"
marker_end = "# <<< ZITADEL OIDC <<<"
filtered = []
in_block = False
for l in keep:
    if l.strip() == marker_start:
        in_block = True
        continue
    if l.strip() == marker_end:
        in_block = False
        continue
    if not in_block:
        filtered.append(l)
keep = filtered
while keep and not keep[-1].strip():
    keep.pop()
new_lines = keep + ["", marker_start] + block.splitlines() + [marker_end, ""]
open(env_path, "w").write("\n".join(new_lines))
print("   patched " + env_path + " (OIDC_* auto-written)")
PYINNER
  rm -f "$PROV_OUT"

  # The API reads .env at process start. A process already listening on 3000
  # keeps the previous client id and answers `Errors.App.NotFound` at the
  # identity provider — a failure that looks like a Zitadel bug.
  if (curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/health 2>/dev/null); then
    echo
    echo "   !! An API is already running on :3000 and still holds the OLD OIDC"
    echo "      client id. Restart it (Ctrl+C, then the api dev command again)."
  fi
else
  echo "==> zitadel already has the vozlab project for $MODE, skipping setup"
fi

# --- 4. Migrations + seed ---------------------------------------------------
echo "==> migrate + seed (tenant dev)"
pnpm --filter @vozlab/database db:migrate 2>&1 | tail -2
pnpm --filter @vozlab/database db:seed:dev 2>&1 | tail -2

# --- 5. zrok shares (demo only) ---------------------------------------------
# A reserved share that is not being shared answers 502 at the zrok edge, so
# the public URLs only work while these processes run. Starting them here
# removes a hidden prerequisite from demo mode.
if [ "$MODE" = "demo" ]; then
  ./scripts/zrok-shares.sh start || echo "   (continuing without zrok shares)" >&2
fi

# --- 6. Hand-off ------------------------------------------------------------
cat <<EOF

==> Stack is up ($MODE mode). Start the app in two terminals:

    source scripts/env.sh $MODE
    pnpm --filter @vozlab/api dev      # http://localhost:3000
    pnpm --filter @vozlab/web dev      # http://localhost:5173

    Test user: testuser / Testpass1!
    Zitadel admin: $ADMIN_LOGIN / Password1!
    Minted JWT (no IdP): pnpm --filter @vozlab/database db:mint-token -- --as maintainer

    Env file in use: $ENV_FILE  (OIDC_* auto-written, no copy-paste needed)
    Zitadel instance: $PROJECT (port 8081)
EOF
