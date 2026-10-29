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
| Intermittent `502`/`403` on a reserved share while `zrok share reserved` still reports "access your zrok share" | Known zrok behaviour (openziti/zrok#1259): the edge-router circuit is lost silently and the CLI keeps reporting the share as up. Kill the `zrok share reserved … --headless` process for that share and start it again; the share reconnects to a live router. |
| `ERR_CONNECTION_REFUSED` after login | The API or web dev server is not running, or `WEB_ORIGIN` does not match the public origin. |
| CORS / cookie not sent between web and API shares | The API enables CORS with credentials (`origin: true`). Ensure `WEB_ORIGIN` matches the web share and the API restarts after `.env` changes. |
| Zitadel says the PAT is rejected | The PAT only exists after the first init of an empty DB. See the recovery steps printed by `scripts/setup-zitadel.sh`. |

## Related

- `scripts/setup-zitadel.sh` — unattended provisioning.
- `scripts/demo.sh` — local launcher (zrok, three reserved shares).
- `docs/archive/history/runbook-deploy-cloudflare-tunnel.md` — Cloudflare Tunnel production demo.
- `docs/decisions/ADR-0030-zitadel-replaces-keycloak.md` — broker decision and
  bootstrap procedure.

---

# Appendices — carried from the frozen demo analysis

> Lifted 2026-10-29 from `docs/archive/knowledge-transfer/12-local-demo-and-parity.md`
> (§3, §5, §7, §9), which is otherwise archived. Adjusted to the current stack
> (Zitadel broker, zrok three shares, containers built).

## Demo hardening for a live audience

| Item | Action | Why |
| --- | --- | --- |
| Published ports | Bind to `127.0.0.1` (for example `127.0.0.1:5432:5432`); do not publish Ollama | Conference networks are shared (`09` S-05). |
| Credentials | Change the database password; set a Redis password; generate a fresh `JWT_SECRET` (at least 32 characters) | The example values are public in the repository. |
| Mode | Build the web app and run the built server; keep the dev server for development only | Fewer moving parts and no hot reload during the talk. |
| Dev sign-in | Keep it (development builds only); it is the presenter's maintainer role | Needed to approve seeded proposals (ROADMAP 3.9). |
| Network | Work with the network disabled after the first pull | Proves the local claim and removes a failure mode. Confirm the fonts and assets are vendored (they are: IBM Plex). |
| Logs | Keep `LOG_PRETTY=true` on the presenter's screen only if it helps; otherwise off | Readability versus noise. |
| Machine | Power adapter, the presentation resolution, and a second screen for the presenter's notes | Routine, but it breaks talks. |
| Rehearsal | Full run twice, the day before and the morning of | Catches the stale state and the port conflicts. |

## A demonstration script that does not depend on luck

The script is a suggestion. Each scene states what it shows and what to say about the limits, because an honest limit
builds more trust than a claim that breaks.

| # | Scene | What to show | What to say (and the honest limit) |
| --- | --- | --- | --- |
| 1 | The problem | The Spanish demo graph, three clusters | "This is a seeded demonstration. The seed is labelled as such." |
| 2 | Joining | An event code (the raw code is shown once by the CLI) | "No tenant is visible in the code. Codes expire and can be revoked." |
| 3 | Signing in | Zitadel sign-in (after section 6) | "This is a real sign-in flow; the identity provider is local for the talk." |
| 4 | Exploring | Zoom, walk by clicking, the inspector | "The layout is a physics simulation; it is deterministic for a given input." |
| 5 | Creating | A new node | **Limit:** the node is `PENDING` and stays so. "Acceptance of a new item is not yet in the product; it is the next milestone." (F-01) |
| 6 | Proposing | A correction proposal, then approval as maintainer | Works. Show the diff. |
| 7 | Discussing and voting | A thread, a reply, a vote | Works. |
| 8 | The AI | Create a node, then show the embedding arriving in the logs (seconds). The Relator verdict can take minutes on a laptop CPU | Pre-run it, or show the recording. "The agents propose; people decide." |
| 9 | Offline | Disable the network; the shell still opens | **Limit:** data needs the network. "The product is online-first by design." |
| 10 | Architecture | The ADRs, the decision register (`15`) | "Every decision has a recorded trade-off." |

**Traps to avoid:**

- Do not promise that agent suggestions become accepted content. They cannot yet (F-01).
- Do not create dozens of nodes live; the AI queue on a laptop will lag and the graph will move unpredictably.
- Do not show the Consolidator. It does not exist.
- Do not claim performance numbers you have not measured for the audience's scale. The verified synthetic figures are
  in ADR-0027 and should be quoted as synthetic.

## Presenter's checklist (the morning of)

- [ ] Machine on power; notifications off; a second screen or a printed copy of the script.
- [ ] Pull request and branch state known; no uncommitted changes in the demo path.
- [ ] `.env` with fresh secrets; ports bound to loopback (`docker compose ps` shows `127.0.0.1`).
- [ ] `docker compose up -d`; `db:migrate`; `db:seed:dev` (the seed is idempotent); API health returns `ready`.
- [ ] Models pulled and loaded (`ollama list`); the embedding of a test node completes.
- [ ] Web built; the built server serves on the expected port; the browser cache cleared once.
- [ ] Sign-in works (Zitadel or dev sign-in); the presenter can approve a seeded proposal.
- [ ] Network disabled and the demo runs; then re-enabled for the questions.
- [ ] Recorded fallback for scenes 8 and 9 on the desktop; screenshots of scenes 4 and 6.
- [ ] Mobile layout checked at 375 px if the audience may ask (the layout is mobile-first).
- [ ] After the talk: stop the stack; do not leave the laptop serving anything.

## Parity: what the local stack must keep equal to production

The rule is that **a local behaviour that production cannot have is a defect**, not a convenience. Keep these equal:

- The environment variable names (the same set, loaded from a file locally and from Secrets Manager in production).
- The Redis-compatible engine: Valkey locally and in ElastiCache (`11` §4.4).
- The database extensions: pgvector locally and in RDS; AGE removed from both (`05` §13).
- The identity contract: the same issuer and claim mapping, with Zitadel standing in for the institutional provider.
- The model contract: the same HTTP interface for Ollama, and the same embedding dimension and model identifier.
- The transport: HTTPS in production; on the laptop, document the difference and test cookies in staging.

The gaps that will remain (no load balancer, no CDN, no WAF locally) are acceptable because they are tested in staging.
