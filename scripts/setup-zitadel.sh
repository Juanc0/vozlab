#!/usr/bin/env bash
# Setup Zitadel for VozLab development.
# Usage: ./scripts/setup-zitadel.sh
# Prerequisites: Zitadel running on localhost:8081 (docker compose --profile idp up -d)

set -euo pipefail

ZITADEL_URL="${ZITADEL_URL:-http://localhost:8081}"
ADMIN_USER="${ZITADEL_ADMIN_USER:-zitadel-admin@zitadel.localhost}"
ADMIN_PASS="${ZITADEL_ADMIN_PASS:-Password1!}"

echo "=== Setting up Zitadel for VozLab ==="
echo "URL: $ZITADEL_URL"

# 1. Get admin session token
echo "1. Authenticating as admin..."
SESSION=$(curl -s -X POST "$ZITADEL_URL/v2/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"checks\":{\"user\":{\"loginName\":\"$ADMIN_USER\"},\"password\":{\"password\":\"$ADMIN_PASS\"}}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionToken'])")

echo "   Session token obtained."

# 2. Create project
echo "2. Creating project 'vozlab'..."
PROJECT=$(curl -s -X POST "$ZITADEL_URL/management/v1/projects" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{"name":"vozlab"}')
PROJECT_ID=$(echo "$PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Project ID: $PROJECT_ID"

# 3. Create OIDC application
echo "3. Creating OIDC application 'vozlab-api'..."
APP=$(curl -s -X POST "$ZITADEL_URL/management/v1/projects/$PROJECT_ID/apps/oidc" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vozlab-api",
    "redirectUris": ["http://localhost:3000/api/v1/auth/callback"],
    "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
    "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
    "appType": "OIDC_APP_TYPE_WEB",
    "authMethodType": "OIDC_AUTH_METHOD_TYPE_BASIC",
    "postLogoutRedirectUris": ["http://localhost:5173"],
    "devMode": true
  }')
CLIENT_ID=$(echo "$APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['clientId'])")
echo "   Client ID: $CLIENT_ID"

# 4. Generate client secret
echo "4. Generating client secret..."
SECRET=$(curl -s -X POST "$ZITADEL_URL/management/v1/projects/$PROJECT_ID/apps/$(echo $APP | python3 -c "import sys,json; print(json.load(sys.stdin)['appId'])")/oidc_config/_generate_client_secret" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{}')
CLIENT_SECRET=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['clientSecret'])")
echo "   Client Secret: ${CLIENT_SECRET:0:10}..."

# 5. Get org ID
echo "5. Getting organization ID..."
ORG_ID=$(curl -s -X POST "$ZITADEL_URL/management/v1/orgs/_search" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
echo "   Org ID: $ORG_ID"

# 6. Create test user
echo "6. Creating test user 'testuser'..."
USER=$(curl -s -X POST "$ZITADEL_URL/v2/users/human" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "profile": {"givenName": "Test", "familyName": "User"},
    "email": {"email": "testuser@example.org", "isVerified": true},
    "password": {"password": "Testpass1!", "changeRequired": false}
  }')
echo "   User created: $(echo $USER | python3 -c "import sys,json; print(json.load(sys.stdin).get('userId','ERROR'))")"

# 7. Print .env values
echo ""
echo "=== Update your .env with these values ==="
echo "OIDC_CLIENT_ID=$CLIENT_ID"
echo "OIDC_CLIENT_SECRET=$CLIENT_SECRET"
echo "OIDC_ISSUER=$ZITADEL_URL"
echo "OIDC_AUTH_URL=$ZITADEL_URL/oauth/v2/authorize"
echo "OIDC_TOKEN_URL=$ZITADEL_URL/oauth/v2/token"
echo "OIDC_USERINFO_URL=$ZITADEL_URL/oidc/v1/userinfo"
echo "OIDC_JWKS_URL=$ZITADEL_URL/oauth/v2/keys"
echo "OIDC_SCOPES=openid profile email urn:zitadel:iam:org:id:$ORG_ID"
echo ""
echo "=== Update your DB ==="
echo "docker exec vozlab-postgres psql -U postgres -d vozlab_router -c \\"
echo "  \"UPDATE public.tenants SET oidc_tenant_id = '$ORG_ID' WHERE slug = 'sabana';\""
echo ""
echo "=== Setup complete ==="