#!/usr/bin/env bash
# Register VozLab database URIs in the desktop keyring for the Postgres MCP.
#
# The MCP servers run inside their own container (scripts/postgres-mcp.sh), so a
# URI must reach Postgres through host.docker.internal — never localhost. This
# script composes that URI from the credentials scripts/env.sh already exports and
# stores it under service "vozlab-db", key "<database>", which is exactly what the
# mcp.json entries reference. Secrets travel from the environment into the keyring
# through a pipe: nothing is written to disk and nothing is printed.
#
# Usage (after `source scripts/env.sh <mode>`):
#   ./scripts/mcp-postgres-uris.sh list          # detected databases + state
#   ./scripts/mcp-postgres-uris.sh sync          # register every detected database
#   ./scripts/mcp-postgres-uris.sh check         # verify every stored URI connects
#   ./scripts/mcp-postgres-uris.sh emit          # print the mcp.json entries
#   ./scripts/mcp-postgres-uris.sh remove <db>   # forget one database
#
# Overrides: MCP_PG_USER, MCP_PG_PASSWORD, MCP_PG_HOST, MCP_PG_PORT,
# MCP_PG_SERVICE, MCP_PG_DB_PREFIX, PG_CONTAINER, MCP_PG_PROBE_IMAGE.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CONTAINER="${PG_CONTAINER:-vozlab-postgres}"
URI_HOST="${MCP_PG_HOST:-host.docker.internal}"
URI_PORT="${MCP_PG_PORT:-${ROUTER_DB_PORT:-5432}}"
URI_USER="${MCP_PG_USER:-${ROUTER_DB_USER:-postgres}}"
URI_PASSWORD="${MCP_PG_PASSWORD:-${ROUTER_DB_PASSWORD:-}}"
SERVICE="${MCP_PG_SERVICE:-vozlab-db}"
DB_PREFIX="${MCP_PG_DB_PREFIX:-vozlab_}"
PROBE_IMAGE="${MCP_PG_PROBE_IMAGE:-postgres:17-alpine}"

usage() {
  sed -n '3,25p' "${BASH_SOURCE[0]:-$0}" | sed 's/^# \{0,1\}//'
}

die() { echo "!! $*" >&2; exit 1; }

require() {
  local tool="$1" hint="$2"
  command -v "$tool" >/dev/null 2>&1 || die "$tool not found — $hint"
}

# Databases that live in the shared Postgres instance, oldest first.
detect_databases() {
  docker exec "$CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -lqt' 2>/dev/null \
    | cut -d'|' -f1 \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | grep -E "^${DB_PREFIX}" \
    | sort
}

urlencode() {
  python3 -c 'import sys, urllib.parse; sys.stdout.write(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# MCP server name derived from the database name: predictable, and legal for Pi
# (letters, digits, dash). Underscores become dashes so two databases never
# collapse into the same server name.
server_name_for() {
  local db="$1"
  printf 'postgres-%s' "$(printf '%s' "${db#"$DB_PREFIX"}" | tr '_' '-')"
}

instance_for() {
  printf '%s' "$(printf '%s' "${1#"$DB_PREFIX"}" | tr '_' '-')"
}

register_one() {
  local db="$1" encoded
  [ -n "$URI_PASSWORD" ] || die "no password — run 'source scripts/env.sh <mode>' first"
  encoded="$(urlencode "$URI_PASSWORD")" || die "cannot URL-encode the password (python3?)"
  printf 'postgresql://%s:%s@%s:%s/%s' \
    "$URI_USER" "$encoded" "$URI_HOST" "$URI_PORT" "$db" \
    | secret-tool store --label="VozLab Postgres: $db" service "$SERVICE" key "$db" \
    || die "secret-tool store failed for $db (is the session keyring unlocked?)"
  echo "   stored   $db"
}

check_one() {
  local db="$1" uri
  uri="$(secret-tool lookup service "$SERVICE" key "$db")"
  [ -n "$uri" ] || { echo "   missing  $db"; return 1; }
  if docker run --rm --add-host=host.docker.internal:host-gateway \
      -e PGURI="$uri" "$PROBE_IMAGE" \
      sh -c 'psql "$PGURI" -tAc "select 1"' >/dev/null 2>&1; then
    echo "   ok       $db"
  else
    echo "   FAILED   $db  (wrong host, credentials or password encoding)"
    return 1
  fi
}

detected_or_die() {
  local -a dbs
  mapfile -t dbs < <(detect_databases)
  [ "${#dbs[@]}" -gt 0 ] \
    || die "no ${DB_PREFIX}* database in container '$CONTAINER' — is the stack up? (./scripts/dev-up.sh)"
  printf '%s\n' "${dbs[@]}"
}

cmd_list() {
  local db
  while IFS= read -r db; do
    if secret-tool lookup service "$SERVICE" key "$db" >/dev/null 2>&1; then
      echo "   stored   $db  -> mcp server $(server_name_for "$db")"
    else
      echo "   missing  $db  -> run: $0 sync"
    fi
  done < <(detected_or_die)
}

cmd_sync() {
  local db
  while IFS= read -r db; do register_one "$db"; done < <(detected_or_die)
  echo "==> done. Add any new server to mcp.json with: $0 emit"
}

cmd_check() {
  local db rc=0
  while IFS= read -r db; do check_one "$db" || rc=1; done < <(detected_or_die)
  return $rc
}

block_for() {
  local db="$1" wrapper="$2"
  cat <<EOF
  "$(server_name_for "$db")": {
    "command": "$wrapper",
    "env": {
      "MCP_INSTANCE": "$(instance_for "$db")",
      "ACCESS_MODE": "unrestricted",
      "DATABASE_URI": "!secret-tool lookup service $SERVICE key $db"
    },
    "exposure": "deferred",
    "description": "VozLab database $db (read-write access mode)."
  }
EOF
}

cmd_emit() {
  local db wrapper="$REPO_ROOT/scripts/postgres-mcp.sh" out=""
  while IFS= read -r db; do
    [ -z "$out" ] || out+=$'\n,\n'
    out+="$(block_for "$db" "$wrapper")"
  done < <(detected_or_die)
  printf '{\n%s\n}\n' "$out"
}

cmd_remove() {
  local db="${1:-}"
  [ -n "$db" ] || die "usage: $0 remove <database>"
  secret-tool clear service "$SERVICE" key "$db" 2>/dev/null \
    && echo "   removed  $db" \
    || die "no stored URI for $db"
}

main() {
  require docker "the Postgres container is required"
  require secret-tool "install libsecret (secret-tool) to use the desktop keyring"

  case "${1:-}" in
    list)   cmd_list ;;
    sync)   cmd_sync ;;
    check)  cmd_check ;;
    emit)   cmd_emit ;;
    remove) shift; cmd_remove "${1:-}" ;;
    ""|-h|--help|help) usage ;;
    *) die "unknown command: $1 (list | sync | check | emit | remove <db>)" ;;
  esac
}

main "$@"
