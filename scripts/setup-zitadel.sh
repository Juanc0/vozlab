#!/usr/bin/env bash
# Provision Zitadel for VozLab development.
#
# Usage:
#   ./scripts/setup-zitadel.sh
#
# Public demo behind zrok (the management calls stay on localhost, the printed
# issuer points at the public auth share). Zitadel resolves the instance from
# the Host header, so the script forwards the public host automatically:
#   ZITADEL_URL=http://localhost:8081 \
#   ZITADEL_PUBLIC_URL=https://vozlabauth.share.zrok.io \
#   API_CALLBACK=https://vozlabapi.share.zrok.io/api/v1/auth/callback \
#   WEB_ORIGIN=https://vozlabdemo.share.zrok.io \
#   ./scripts/setup-zitadel.sh
#
# How authentication works (Zitadel v4.16):
#   The anonymous password login on POST /v2/sessions was removed. This script
#   does not use it. Instead, the Zitadel first init creates a machine user with
#   the IAM_OWNER role and writes its PAT to /zitadel/bootstrap/admin.pat
#   (bind-mounted from ./.zitadel-bootstrap). The PAT is used directly as the
#   Bearer token for every management call. If the file is not readable on the
#   host, the script falls back to `docker cp` from the running container.
#
#   The PAT only exists after the first init of an empty Zitadel database. If it
#   is missing or rejected, see the message printed by the script.
#
# Environment:
#   ZITADEL_URL              Management base URL       (default http://localhost:8081)
#   ZITADEL_PUBLIC_URL       Public issuer URL         (default ZITADEL_URL)
#   ZITADEL_HOST_HEADER      Host header for local management calls (derived from
#                            ZITADEL_PUBLIC_URL when it differs from ZITADEL_URL)
#   ZITADEL_FORWARDED_PROTO  X-Forwarded-Proto for local calls (derived too)
#   API_CALLBACK             OIDC redirect URI         (default http://localhost:3000/api/v1/auth/callback)
#   WEB_ORIGIN               PWA origin / logout URI   (default http://localhost:5173)
#   EXTRA_REDIRECT_URIS      Comma-separated extra redirect URIs
#   ZITADEL_ADMIN_PAT        Use this PAT instead of the bootstrap file
#   ZITADEL_ADMIN_PAT_FILE   PAT file path             (default ./.zitadel-bootstrap/admin.pat)
#   ZITADEL_BOOTSTRAP_DIR    Bootstrap directory       (default ./.zitadel-bootstrap)
#   ZITADEL_CONTAINER        Container to read the PAT from with docker cp
#   ZITADEL_PROJECT_NAME     Project name              (default vozlab)
#   ZITADEL_APP_NAME         OIDC app name             (default vozlab-api)
#   ZITADEL_TEST_USER        Test user login name      (default testuser)
#   ZITADEL_TEST_PASSWORD    Test user password        (default Testpass1!)
#   ZITADEL_TEST_EMAIL       Test user email           (default testuser@example.org)
#   TENANT_SLUG              Tenant to update          (default sabana)

set -euo pipefail

ZITADEL_URL="${ZITADEL_URL:-http://localhost:8081}"
ZITADEL_URL="${ZITADEL_URL%/}"
ZITADEL_PUBLIC_URL="${ZITADEL_PUBLIC_URL:-$ZITADEL_URL}"
ZITADEL_PUBLIC_URL="${ZITADEL_PUBLIC_URL%/}"
# Zitadel resolves the instance from the Host header. When it runs with a public
# external domain (ZITADEL_EXTERNALDOMAIN) but the management calls go to
# localhost, they must carry the public host name and the forwarded protocol or
# Zitadel answers 404 "Instance not found".
ZITADEL_HOST_HEADER="${ZITADEL_HOST_HEADER:-}"
ZITADEL_FORWARDED_PROTO="${ZITADEL_FORWARDED_PROTO:-}"
if [ -z "$ZITADEL_HOST_HEADER" ] && [ "$ZITADEL_PUBLIC_URL" != "$ZITADEL_URL" ]; then
  ZITADEL_HOST_HEADER=$(python3 -c 'import sys, urllib.parse as u; print(u.urlparse(sys.argv[1]).netloc)' "$ZITADEL_PUBLIC_URL")
  ZITADEL_FORWARDED_PROTO=$(python3 -c 'import sys, urllib.parse as u; print(u.urlparse(sys.argv[1]).scheme)' "$ZITADEL_PUBLIC_URL")
fi
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"
API_CALLBACK="${API_CALLBACK:-http://localhost:3000/api/v1/auth/callback}"
EXTRA_REDIRECT_URIS="${EXTRA_REDIRECT_URIS:-}"
PROJECT_NAME="${ZITADEL_PROJECT_NAME:-vozlab}"
APP_NAME="${ZITADEL_APP_NAME:-vozlab-api}"
TEST_USER="${ZITADEL_TEST_USER:-testuser}"
TEST_PASSWORD="${ZITADEL_TEST_PASSWORD:-Testpass1!}"
TEST_EMAIL="${ZITADEL_TEST_EMAIL:-testuser@example.org}"
TEST_GIVEN_NAME="${ZITADEL_TEST_GIVEN_NAME:-Test}"
TEST_FAMILY_NAME="${ZITADEL_TEST_FAMILY_NAME:-User}"
TENANT_SLUG="${TENANT_SLUG:-sabana}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_DIR="${ZITADEL_BOOTSTRAP_DIR:-$ROOT_DIR/.zitadel-bootstrap}"
PAT_FILE="${ZITADEL_ADMIN_PAT_FILE:-$BOOTSTRAP_DIR/admin.pat}"

log() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,41p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

# Read a dotted path (with numeric list indexes) from a JSON document on stdin.
# Prints an empty line when the key is absent; exits 2 on invalid JSON.
json_get() {
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(2)
for part in sys.argv[1].split("."):
    if not part:
        continue
    if isinstance(data, list):
        try:
            data = data[int(part)]
        except (IndexError, ValueError):
            data = None
    elif isinstance(data, dict):
        data = data.get(part)
    else:
        data = None
    if data is None:
        break
if data is None:
    print("")
elif isinstance(data, (dict, list)):
    print(json.dumps(data, separators=(",", ":")))
else:
    print(data)
' "$1"
}

# api METHOD PATH [JSON_BODY]
# Prints the response body on 2xx, otherwise the body goes to stderr and the
# function returns 1.
api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp code
  tmp=$(mktemp)
  local -a args=(
    -sS -o "$tmp" -w '%{http_code}' -X "$method" "$ZITADEL_URL$path"
    -H "Authorization: Bearer $PAT"
    -H 'Accept: application/json'
  )
  if [ -n "$ZITADEL_HOST_HEADER" ]; then
    args+=(-H "Host: $ZITADEL_HOST_HEADER")
  fi
  if [ -n "$ZITADEL_FORWARDED_PROTO" ]; then
    args+=(-H "X-Forwarded-Proto: $ZITADEL_FORWARDED_PROTO")
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  code=$(curl "${args[@]}" 2>/dev/null || true)
  if [ -z "$code" ] || [ "$code" -lt 200 ] || [ "$code" -gt 299 ]; then
    printf 'ERROR: %s %s -> HTTP %s\n' "$method" "$path" "${code:-000}" >&2
    sed 's/^/  /' "$tmp" >&2 || true
    rm -f "$tmp"
    return 1
  fi
  cat "$tmp"
  rm -f "$tmp"
}

# api_no_changes_ok METHOD PATH [JSON_BODY]
# Zitadel answers 400 COMMAND-1m88i ("No changes") when a PUT repeats the
# current configuration. For idempotent provisioning that is a success.
api_no_changes_ok() {
  local out
  if out=$(api "$@" 2>&1); then
    printf '%s' "$out"
    return 0
  fi
  case "$out" in
    *COMMAND-1m88i* | *'"message":"No changes"'*) return 0 ;;
  esac
  printf '%s\n' "$out" >&2
  return 1
}

wait_for_zitadel() {
  local i
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "$ZITADEL_URL/debug/ready" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

find_zitadel_container() {
  if [ -n "${ZITADEL_CONTAINER:-}" ]; then
    printf '%s\n' "$ZITADEL_CONTAINER"
    return 0
  fi
  local name
  for name in vozlab-zitadel $(docker ps --format '{{.Names}}' 2>/dev/null || true); do
    [ -n "$name" ] || continue
    if docker inspect "$name" --format '{{range .Mounts}}{{.Destination}} {{end}}' 2>/dev/null |
      grep -q '/zitadel/bootstrap'; then
      printf '%s\n' "$name"
      return 0
    fi
  done
  return 1
}

read_admin_pat() {
  if [ -n "${ZITADEL_ADMIN_PAT:-}" ]; then
    printf '%s' "$ZITADEL_ADMIN_PAT"
    return 0
  fi
  if [ -s "$PAT_FILE" ]; then
    tr -d '\r\n' <"$PAT_FILE"
    return 0
  fi
  # Named-volume setups (for example docker/identity-lab/zitadel) do not expose
  # the PAT on the host. Read it through the Docker API instead of a shell.
  local container pat
  if container=$(find_zitadel_container); then
    pat=$(docker cp "$container:/zitadel/bootstrap/admin.pat" - 2>/dev/null |
      tar -xO 2>/dev/null | tr -d '\r\n' || true)
    if [ -n "$pat" ]; then
      printf '%s' "$pat"
      return 0
    fi
  fi
  return 1
}

print_recovery_help() {
  cat >&2 <<EOF

The admin PAT is created only by the first init of an empty Zitadel database.
If the instance was recreated, the DB already contains data and the init step did
not run again, so no PAT was written.

Regenerate it (this destroys the Zitadel database, not the VozLab database):

  # Stop the Zitadel stack (adjust the compose file if you use the identity lab)
  docker compose --profile idp rm -sf zitadel zitadel-db

  # Remove only the Zitadel data volume and the stale PAT
  docker volume rm ${COMPOSE_PROJECT_NAME:-vozlab}_zitadel_db_data
  rm -f "$PAT_FILE"

  # Start Zitadel again; start-from-init writes the PAT
  docker compose --profile idp up -d zitadel-db zitadel

  # Then rerun this script
  ./scripts/setup-zitadel.sh

Alternative: create a PAT manually in the console for a machine user with the
IAM_OWNER role and pass it as ZITADEL_ADMIN_PAT=... to this script.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

need curl
need python3

log "=== Zitadel setup for VozLab ==="
log "Management URL: $ZITADEL_URL"
log "Public issuer:  $ZITADEL_PUBLIC_URL"
log ""

if ! wait_for_zitadel; then
  fail "Zitadel is not ready at $ZITADEL_URL. Start it with: docker compose --profile idp up -d zitadel-db zitadel"
fi
log "1. Zitadel is ready."

PAT=$(read_admin_pat) || PAT=""
if [ -z "$PAT" ]; then
  fail "no admin PAT found at $PAT_FILE (or in the running container)."
fi

if [ -n "${ZITADEL_ADMIN_PAT:-}" ]; then
  log "2. Using admin PAT from ZITADEL_ADMIN_PAT."
else
  log "2. Using admin PAT from $PAT_FILE (or the running container)."
fi

if ! ORG_RESP=$(api GET /management/v1/orgs/me); then
  print_recovery_help
  fail "the admin PAT was rejected by Zitadel."
fi
ORG_ID=$(printf '%s' "$ORG_RESP" | json_get 'org.id')
ORG_NAME=$(printf '%s' "$ORG_RESP" | json_get 'org.name')
[ -n "$ORG_ID" ] || fail "could not read the organization id from /management/v1/orgs/me"
log "3. Organization: $ORG_NAME ($ORG_ID)"

# 4. Project (reuse it when it already exists).
PROJECT_SEARCH_BODY=$(python3 -c '
import json, sys
print(json.dumps({"queries": [{"nameQuery": {"name": sys.argv[1], "method": "TEXT_QUERY_METHOD_EQUALS"}}]}))
' "$PROJECT_NAME")
PROJECT_RESP=$(api POST /management/v1/projects/_search "$PROJECT_SEARCH_BODY") ||
  fail "could not search projects."
PROJECT_ID=$(printf '%s' "$PROJECT_RESP" | json_get 'result.0.id')
if [ -n "$PROJECT_ID" ]; then
  log "4. Reusing project '$PROJECT_NAME' ($PROJECT_ID)."
else
  PROJECT_BODY=$(python3 -c '
import json, sys
print(json.dumps({"name": sys.argv[1]}))
' "$PROJECT_NAME")
  PROJECT_RESP=$(api POST /management/v1/projects "$PROJECT_BODY") ||
    fail "could not create project '$PROJECT_NAME'."
  PROJECT_ID=$(printf '%s' "$PROJECT_RESP" | json_get 'id')
  [ -n "$PROJECT_ID" ] || fail "project creation returned no id"
  log "4. Created project '$PROJECT_NAME' ($PROJECT_ID)."
fi

# 5. OIDC application. Merge the redirect URIs with the existing ones so a
#    localhost app keeps working after the public zrok URL is added.
REDIRECT_URIS=("$API_CALLBACK")
if [ -n "$EXTRA_REDIRECT_URIS" ]; then
  IFS=',' read -r -a _extra_uris <<<"$EXTRA_REDIRECT_URIS"
  REDIRECT_URIS+=("${_extra_uris[@]}")
fi
REDIRECTS_JSON=$(python3 -c '
import json, sys
print(json.dumps([uri.strip() for uri in sys.argv[1:] if uri.strip()]))
' "${REDIRECT_URIS[@]}")
LOGOUT_JSON=$(python3 -c '
import json, sys
print(json.dumps([uri.strip() for uri in sys.argv[1:] if uri.strip()]))
' "$WEB_ORIGIN")

APP_SEARCH_BODY=$(python3 -c '
import json, sys
print(json.dumps({"queries": [{"nameQuery": {"name": sys.argv[1], "method": "TEXT_QUERY_METHOD_EQUALS"}}]}))
' "$APP_NAME")
APP_RESP=$(api POST "/management/v1/projects/$PROJECT_ID/apps/_search" "$APP_SEARCH_BODY") ||
  fail "could not search applications in project $PROJECT_ID."
APP_ID=$(printf '%s' "$APP_RESP" | json_get 'result.0.id')
CLIENT_ID=$(printf '%s' "$APP_RESP" | json_get 'result.0.oidcConfig.clientId')
CLIENT_SECRET=""

if [ -n "$APP_ID" ]; then
  [ -n "$CLIENT_ID" ] ||
    fail "application '$APP_NAME' exists but has no OIDC configuration"
  log "5. Reusing OIDC application '$APP_NAME' ($APP_ID)."
  UPDATE_BODY=$(printf '%s' "$APP_RESP" | python3 -c '
import json, sys
app = json.load(sys.stdin)["result"][0]
config = app.get("oidcConfig") or {}
redirects = list(config.get("redirectUris") or [])
for uri in json.loads(sys.argv[1]):
    if uri not in redirects:
        redirects.append(uri)
logout = list(config.get("postLogoutRedirectUris") or [])
for uri in json.loads(sys.argv[2]):
    if uri not in logout:
        logout.append(uri)
print(json.dumps({
    "redirectUris": redirects,
    "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
    "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
    "appType": "OIDC_APP_TYPE_WEB",
    "authMethodType": "OIDC_AUTH_METHOD_TYPE_BASIC",
    "postLogoutRedirectUris": logout,
    "devMode": True,
}))
' "$REDIRECTS_JSON" "$LOGOUT_JSON") || fail "could not build the OIDC app update"
  api_no_changes_ok PUT "/management/v1/projects/$PROJECT_ID/apps/$APP_ID/oidc_config" "$UPDATE_BODY" >/dev/null ||
    fail "could not update the OIDC redirect URIs"
else
  CREATE_BODY=$(python3 -c '
import json, sys
print(json.dumps({
    "name": sys.argv[3],
    "redirectUris": json.loads(sys.argv[1]),
    "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
    "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
    "appType": "OIDC_APP_TYPE_WEB",
    "authMethodType": "OIDC_AUTH_METHOD_TYPE_BASIC",
    "postLogoutRedirectUris": json.loads(sys.argv[2]),
    "devMode": True,
}))
' "$REDIRECTS_JSON" "$LOGOUT_JSON" "$APP_NAME")
  APP_RESP=$(api POST "/management/v1/projects/$PROJECT_ID/apps/oidc" "$CREATE_BODY") ||
    fail "could not create the OIDC application '$APP_NAME'."
  APP_ID=$(printf '%s' "$APP_RESP" | json_get 'appId')
  CLIENT_ID=$(printf '%s' "$APP_RESP" | json_get 'clientId')
  CLIENT_SECRET=$(printf '%s' "$APP_RESP" | json_get 'clientSecret')
  [ -n "$APP_ID" ] && [ -n "$CLIENT_ID" ] ||
    fail "OIDC application creation returned no appId/clientId"
  log "5. Created OIDC application '$APP_NAME' ($APP_ID)."
fi

# Always rotate the secret so the printed value is guaranteed to be current.
SECRET_RESP=$(api POST "/management/v1/projects/$PROJECT_ID/apps/$APP_ID/oidc_config/_generate_client_secret" '{}') ||
  fail "could not generate the OIDC client secret"
CLIENT_SECRET=$(printf '%s' "$SECRET_RESP" | json_get 'clientSecret')
[ -n "$CLIENT_SECRET" ] || fail "the client secret endpoint returned no secret"
log "6. Client ID: $CLIENT_ID"
log "   Client secret generated (any previous secret is now invalid)."

# 7. Test user (reuse it when it already exists).
USER_SEARCH_BODY=$(python3 -c '
import json, sys
print(json.dumps({"queries": [{"userNameQuery": {"userName": sys.argv[1], "method": "TEXT_QUERY_METHOD_EQUALS"}}]}))
' "$TEST_USER")
USER_RESP=$(api POST /v2/users "$USER_SEARCH_BODY") ||
  fail "could not search users."
USER_ID=$(printf '%s' "$USER_RESP" | json_get 'result.0.userId')
if [ -n "$USER_ID" ]; then
  log "7. Reusing test user '$TEST_USER' ($USER_ID)."
else
  USER_BODY=$(python3 -c '
import json, sys
print(json.dumps({
    "username": sys.argv[1],
    "profile": {"givenName": sys.argv[4], "familyName": sys.argv[5]},
    "email": {"email": sys.argv[2], "isVerified": True},
    "password": {"password": sys.argv[3], "changeRequired": False},
}))
' "$TEST_USER" "$TEST_EMAIL" "$TEST_PASSWORD" "$TEST_GIVEN_NAME" "$TEST_FAMILY_NAME")
  USER_RESP=$(api POST /v2/users/human "$USER_BODY") ||
    fail "could not create the test user '$TEST_USER'."
  USER_ID=$(printf '%s' "$USER_RESP" | json_get 'userId')
  [ -n "$USER_ID" ] || fail "user creation returned no userId"
  log "7. Created test user '$TEST_USER' ($USER_ID)."
fi

cat <<EOF

=== .env (OIDC) ===
OIDC_CLIENT_ID=$CLIENT_ID
OIDC_CLIENT_SECRET=$CLIENT_SECRET
OIDC_REDIRECT_URI=$API_CALLBACK
OIDC_ISSUER=$ZITADEL_PUBLIC_URL
OIDC_AUTH_URL=$ZITADEL_PUBLIC_URL/oauth/v2/authorize
OIDC_TOKEN_URL=$ZITADEL_PUBLIC_URL/oauth/v2/token
OIDC_USERINFO_URL=$ZITADEL_PUBLIC_URL/oidc/v1/userinfo
OIDC_JWKS_URL=$ZITADEL_PUBLIC_URL/oauth/v2/keys
OIDC_SCOPES=openid profile email urn:zitadel:iam:org:id:$ORG_ID
WEB_ORIGIN=$WEB_ORIGIN

=== Test user ===
$TEST_USER / $TEST_PASSWORD

=== Update the router DB ===
docker exec vozlab-postgres psql -U postgres -d vozlab_router -c \\
  "UPDATE public.tenants SET oidc_tenant_id = '$ORG_ID' WHERE slug = '$TENANT_SLUG';"

Verify:
docker exec vozlab-postgres psql -U postgres -d vozlab_router -c \\
  "SELECT slug, oidc_tenant_id FROM public.tenants WHERE slug = '$TENANT_SLUG';"

=== Setup complete ===
EOF
