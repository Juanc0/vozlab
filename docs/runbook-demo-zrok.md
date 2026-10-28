# Runbook: expose the local demo with zrok

This runbook publishes a VozLab demo running on the developer host through three
reserved zrok public shares. Each service keeps its own hostname; there is no
reverse proxy.

| Public URL | Local target | Service |
|---|---|---|
| `https://vozlabdemo.share.zrok.io` | `http://localhost:5173` | PWA (SvelteKit) |
| `https://vozlabapi.share.zrok.io` | `http://localhost:3000` | Fastify API |
| `https://vozlabauth.share.zrok.io` | `http://localhost:8081` | Zitadel (login UI + OIDC endpoints) |

All three hostnames are reserved shares, so they stay stable across restarts.
zrok terminates TLS; Zitadel must be told that its public origin is
`https://vozlabauth.share.zrok.io` (port `443`, secure cookies).

> The PWA points at the API share directly
> (`PUBLIC_API_BASE_URL=https://vozlabapi.share.zrok.io/api/v1`). The API enables
> CORS with credentials, so cross-origin cookies work between the two shares.

## 1. Prerequisites

- `zrok` CLI installed and enabled once: `zrok enable <account-token>`.
- Three reserved shares (create once; reuse the tokens afterwards):

  ```bash
  zrok reserve public --unique-name vozlabauth http://127.0.0.1:8081
  zrok reserve public --unique-name vozlabapi  http://127.0.0.1:3000
  zrok reserve public --unique-name vozlabdemo http://127.0.0.1:5173
  ```

  Save the printed share tokens. `zrok overview` lists them again.

- The base stack is running:

  ```bash
  docker compose up -d postgres redis ollama
  pnpm install
  ```

## 2. Start Zitadel with the public auth origin

Changing the external domain on an already initialised instance is supported:
Zitadel rebuilds the OIDC issuer from these values on restart and does **not**
need a database re-init.

```bash
ZITADEL_EXTERNALDOMAIN=vozlabauth.share.zrok.io \
ZITADEL_EXTERNALPORT=443 \
ZITADEL_EXTERNALSECURE=true \
docker compose --profile idp up -d zitadel-db zitadel

# Wait until ready, then confirm the issuer
until curl -fsS -o /dev/null http://localhost:8081/debug/ready; do sleep 2; done
curl -s https://vozlabauth.share.zrok.io/.well-known/openid-configuration \
  | jq -r .issuer
# https://vozlabauth.share.zrok.io
```

Start the auth share in a terminal (or with a process manager):

```bash
zrok share reserved <auth-share-token> --headless
```

## 3. Provision the project, app and test user

Keep the management calls on localhost and pass the public issuer separately so
the printed `.env` block matches what browsers will see:

```bash
ZITADEL_URL=http://localhost:8081 \
ZITADEL_PUBLIC_URL=https://vozlabauth.share.zrok.io \
API_CALLBACK=https://vozlabapi.share.zrok.io/api/v1/auth/callback \
WEB_ORIGIN=https://vozlabdemo.share.zrok.io \
./scripts/setup-zitadel.sh
```

The script reuses the `vozlab` project, merges the redirect URIs (so the
localhost callback keeps working), rotates the client secret and prints:

- the `OIDC_*` values,
- the test user (`testuser` / `Testpass1!`),
- the SQL that sets `tenants.oidc_tenant_id` for the `sabana` tenant.

Run the SQL it prints against the router DB:

```bash
docker exec vozlab-postgres psql -U postgres -d vozlab_router -c \
  "UPDATE public.tenants SET oidc_tenant_id = '<org-id>' WHERE slug = 'sabana';"
```

## 4. Update `.env`

Merge the printed block into `.env` and point the public values at zrok:

```dotenv
OIDC_CLIENT_ID=<printed>
OIDC_CLIENT_SECRET=<printed>
OIDC_REDIRECT_URI=https://vozlabapi.share.zrok.io/api/v1/auth/callback
OIDC_ISSUER=https://vozlabauth.share.zrok.io
OIDC_AUTH_URL=https://vozlabauth.share.zrok.io/oauth/v2/authorize
OIDC_TOKEN_URL=https://vozlabauth.share.zrok.io/oauth/v2/token
OIDC_USERINFO_URL=https://vozlabauth.share.zrok.io/oidc/v1/userinfo
OIDC_JWKS_URL=https://vozlabauth.share.zrok.io/oauth/v2/keys
OIDC_SCOPES=openid profile email urn:zitadel:iam:org:id:<org-id>
WEB_ORIGIN=https://vozlabdemo.share.zrok.io

ZROK_WEB_URL=https://vozlabdemo.share.zrok.io
ZROK_API_URL=https://vozlabapi.share.zrok.io
ZROK_AUTH_URL=https://vozlabauth.share.zrok.io
ZROK_WEB_SHARE_TOKEN=<reserved share token for :5173>
ZROK_API_SHARE_TOKEN=<reserved share token for :3000>
ZROK_AUTH_SHARE_TOKEN=<reserved share token for :8081>
```

The API validates the ID token issuer against `OIDC_ISSUER`; it must be the
public zrok URL, not `http://localhost:8081`. The API reads `.env` at startup, so
restart it after editing.

## 5. Start the demo processes

Five host processes (the main compose does not run the API or the web):

```bash
# Terminal A — API on :3000
pnpm --filter @vozlab/api dev

# Terminal B — PWA on :5173, pointing at the public API share
PUBLIC_API_BASE_URL=https://vozlabapi.share.zrok.io/api/v1 \
  pnpm --filter @vozlab/web dev

# Terminal C — web share
zrok share reserved <web-share-token> --headless

# Terminal D — API share
zrok share reserved <api-share-token> --headless

# Terminal E — auth share (started in step 2)
zrok share reserved <auth-share-token> --headless
```

Or use the launcher, which starts the API, the web and the three shares:

```bash
./scripts/demo.sh
```

## 6. Verify

1. Open `https://vozlabdemo.share.zrok.io`.
2. Log in with `testuser` / `Testpass1!`.
3. Zitadel redirects to the API callback at
   `https://vozlabapi.share.zrok.io/api/v1/auth/callback`, the API exchanges the
   code (back channel to the public auth URL) and sets the refresh cookie.
4. The PWA lands on `/workspaces` (or the workspace selector) with a session.

Confirm the tenant claim with a token when debugging:

```bash
# The ID token must include:
#   urn:zitadel:iam:user:resourceowner:id = <org-id>
```

### First login: JIT user and workspace membership

The first successful OIDC login JIT-provisions the user (and the
`auth.external_identities` row) in the tenant database, but it does not grant
access to any workspace. The PWA shows an empty workspace selector until the
user is a member. For the local demo, add the membership once:

```bash
docker exec vozlab-postgres psql -U postgres -d vozlab_tenant_dev -c \
  "INSERT INTO auth.workspace_memberships (workspace_id, user_id, role)
   SELECT w.id, u.id, 'MEMBER'
   FROM auth.workspaces w, auth.users u
   WHERE w.slug = 'general' AND u.email = 'testuser@example.org'
   ON CONFLICT (workspace_id, user_id) DO NOTHING;"
```

The database name is the tenant's (`vozlab_tenant_dev` for the local seed);
`testuser@example.org` is the email created by the setup script. The user row
only exists after the first successful login, so run this once the callback in
step 3 has completed.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `OIDC issuer mismatch` or `unexpected "iss"` | `OIDC_ISSUER` is still `http://localhost:8081`. Use the public zrok URL and restart the API. |
| Zitadel login page loads but the callback loops | The redirect URI is missing on the app. Re-run the setup script with the public `API_CALLBACK`; it merges URIs. |
| `Set-Cookie` without `Secure` / `__Host-` | Restart Zitadel with `ZITADEL_EXTERNALSECURE=true` and `ZITADEL_EXTERNALPORT=443`. |
| `zrok: TLS handshake timeout` / cannot reach `api-v1.zrok.io` | The host cannot reach the zrok API. Check DNS/proxy/firewall; the share cannot start without it. |
| `ERR_CONNECTION_REFUSED` after login | The API or web dev server is not running, or `WEB_ORIGIN` does not match the public origin. |
| CORS / cookie not sent between web and API shares | The API enables CORS with credentials (`origin: true`). Ensure `WEB_ORIGIN` matches the web share and the API restarts after `.env` changes. |
| Zitadel says the PAT is rejected | The PAT only exists after the first init of an empty DB. See the recovery steps printed by `scripts/setup-zitadel.sh`. |

## Related

- `scripts/setup-zitadel.sh` — unattended provisioning.
- `scripts/demo.sh` — local launcher (zrok, three reserved shares).
- `docs/runbook-deploy.md` — Cloudflare Tunnel production demo.
- `docs/decisions/ADR-0030-zitadel-replaces-keycloak.md` — broker decision and
  bootstrap procedure.