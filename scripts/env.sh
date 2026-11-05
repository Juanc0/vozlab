#!/usr/bin/env bash
# Load environment variables for the current mode.
#
# Usage (source it, do not execute):
#   source scripts/env.sh           # defaults to demo (.env)
#   source scripts/env.sh local     # uses .env.local (localhost dev)
#   source scripts/env.sh demo      # uses .env (zrok demo)
#
# After sourcing, ZITADEL_MASTERKEY and all OIDC_* are in the environment,
# so `docker compose` and the API pick them up without `export` lines.
# This script NEVER exits the shell — errors are reported, not fatal.

MODE="${1:-demo}"

# Resolve this script's directory portably: BASH_SOURCE does not exist in
# zsh, where ${(%):-%x} holds the sourced file path instead.
_env_sh_src=""
if [ -n "${BASH_SOURCE:-}" ] && [ -n "${BASH_SOURCE[0]:-}" ]; then
  _env_sh_src="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  eval '_env_sh_src="${(%):-%x}"'
else
  _env_sh_src="$0"
fi

ROOT="$(cd "$(dirname "$_env_sh_src")/.." && pwd)"
unset _env_sh_src

case "$MODE" in
  local) FILE="$ROOT/.env.local" ;;
  demo)  FILE="$ROOT/.env" ;;
  *)     FILE="$MODE" ;;
esac

if [ ! -f "$FILE" ]; then
  echo "env.sh: $FILE not found" >&2
  echo "   copy .env.example to $FILE and fill in OIDC_* (or run setup-zitadel.sh)" >&2
  return 1 2>/dev/null || true
else
  # Load without leaking set -e / set -u into the caller's shell
  set -a
  # shellcheck disable=SC1090
  . "$FILE" 2>/dev/null || {
    echo "env.sh: error sourcing $FILE" >&2
    set +a
    return 1 2>/dev/null || true
  }
  set +a
  echo "env.sh: loaded $FILE"
fi
