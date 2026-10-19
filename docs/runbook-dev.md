# Development Runbook

How to run VozLab locally from a clean checkout. Production/operations guidance
lives in [runbook-ops.md](runbook-ops.md); architecture and contracts live in
[architecture.md](architecture.md) and [api-reference.md](api-reference.md).

## Prerequisites

| Requirement | Version / note |
| --- | --- |
| Node.js | 22.x |
| pnpm | 12.11.2 (pinned by `packageManager`; run `corepack enable`) |
| Docker + Compose v2 | Required for PostgreSQL, Redis and Ollama |
| Free ports | `3000` (API), `5432` (Postgres), `6379` (Redis), `11434` (Ollama) |

The local Postgres image is built from `docker/postgres/Dockerfile`:
PostgreSQL 18 + Apache AGE 1.8 + pgvector. It is not a stock Postgres image.

## First boot

### 1. Install dependencies

```bash
corepack enable
pnpm install
```

### 2. Create the environment file

```bash
cp .env.example .env
```

`.env` must live at the repository root. The API and database scripts load it
with `tsx --env-file-if-exists=../../.env`; variables already present in the
process environment win. No salt is required: `author_hash` is an opaque
pseudonym stored in `auth.users` and carried as the JWT `authorHash` claim.

| Variable | Required | Notes |
| --- | --- | --- |
| `ROUTER_DB_HOST/PORT/USER/PASSWORD/NAME` | Yes | Router registry DB. |
| `REDIS_HOST` | Yes | `localhost` with Compose. |
| `JWT_SECRET` | Yes | At least 32 characters; must match the minting script. |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | No | `15m` / `30d`; compact durations (`s`, `m`, `h`, `d`, `w`). |
| `OIDC_CLIENT_ID/SECRET/REDIRECT_URI` | Yes | Client credentials and the exact `/api/v1/auth/callback` URL. |
| `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUTH_URL/TOKEN_URL/USERINFO_URL` | Yes | Explicit endpoints; there is no discovery request. |
| `WEB_ORIGIN` | Yes | PWA origin for CORS and post-login redirects (`http://localhost:5173`). |
| `TENANT_DB_*` | No | Defaults to `localhost` / `postgres` / `vozlab_tenant_dev`. Set when using another tenant DB. |
| `LOG_LEVEL`, `LOG_PRETTY` | No | `info`; pretty logs are for local use only. |

> **DB-name rule:** the registry lives in `vozlab_router` (created by the init
> scripts; the Drizzle default and `.env.example` agree). Migrations, the seed
> and the API must all point at the **same** database. The tenant database is
> `vozlab_tenant_dev`.

```dotenv
ROUTER_DB_NAME=vozlab_router
TENANT_DB_NAME=vozlab_tenant_dev
```

### 3. Start infrastructure

```bash
docker compose up -d --build
docker compose ps
```

The first boot initializes extensions, creates `vozlab_router` and
`vozlab_tenant_dev`, and bootstraps the AGE graph. These initdb scripts run
**only on a fresh volume**.

Ollama is started but no model is pulled. Nothing in the current API calls it;
Phase 2 workers will need `nomic-embed-text` and a reasoning model.

### 4. Apply migrations

```bash
pnpm --filter @vozlab/database db:migrate
```

The local defaults (`localhost`, `postgres`, `vozlab_router`,
`vozlab_tenant_dev`) match Compose. `drizzle-kit` does **not** read the repo-root
`.env` (it only auto-loads a `.env` in `packages/database`), so export the
`ROUTER_DB_*` / `TENANT_DB_*` values in the shell if you changed hosts or
credentials. The API, seed and mint scripts do load the root file via `tsx`.

This applies the router migration first, then the tenant migration. The two
physical databases are never mixed. Drizzle configs set `ssl: false` on purpose
for local Postgres.

### 5. Seed the dev tenant

```bash
pnpm --filter @vozlab/database db:seed:dev
```

Idempotent. Creates the `sabana` tenant, the `general` workspace
(`33333333-3333-4333-8333-333333333333`), four dev identities, and the ACTIVE
ontology classes `Problem`, `Idea`, `Resource`.

### 6. Mint a development JWT

```bash
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer | awk '/^eyJ/')
echo "$TOKEN"
```

Available identities: `maintainer`, `moderator`, `member`, `agent`. Tokens are
HS256, valid for 12 hours, and signed with the `JWT_SECRET` the API boots with.
`db:mint-token` remains the no-IdP development path. The real flow is
`GET /api/v1/auth/login` → IdP → `GET /api/v1/auth/callback`; it needs a
registered OIDC client and a configured `WEB_ORIGIN`. The callback sets the
`vozlab_refresh` cookie; `POST /api/v1/auth/refresh` returns the access token.
Without an IdP, keep using the minted token above.

### 7. Create an event code (optional)

The FR-03 join path needs an `event_code`. The global registry lives in the
router DB; the CLI validates the workspace in the tenant DB and prints the raw
code exactly once (only its SHA-256 hash is stored):

```bash
pnpm --filter @vozlab/database db:event-code -- \
  --tenant sabana \
  --workspace 33333333-3333-4333-8333-333333333333 \
  --label "Dev orientation" \
  --days 7 \
  --max-uses 50
```

Put the printed `vle_...` value in the QR or call the endpoint directly:

```bash
curl -s -X POST localhost:3000/api/v1/auth/event-join \
  -H 'content-type: application/json' \
  -c /tmp/vozlab-cookies.txt \
  -d '{"code":"vle_...","alias":"Curious Otter"}'
```

The response is an `AuthSessionDto`; the refresh cookie is written to
`/tmp/vozlab-cookies.txt`. Existing anonymous users keep their refresh session
after the code expires or is revoked; only new joins are blocked.

### 8. Start the API

```bash
pnpm --filter @vozlab/api dev
```

`dev` runs `tsx watch` against TypeScript sources. `start` also runs from source;
there is no emitted `dist/`.

## Verify

```bash
curl -s localhost:3000/health/live
# {"status":"alive"}

curl -s localhost:3000/health/ready
# {"status":"ready","checks":{"database":"up","redis":"up"}}
```

Create a node and read it back:

```bash
WORKSPACE_ID=33333333-3333-4333-8333-333333333333

curl -s -X POST localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WORKSPACE_ID" \
  -H 'content-type: application/json' \
  -d '{"typeKey":"Problem","title":"Dev smoke test","attributes":{"source":"runbook"}}'

curl -s localhost:3000/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WORKSPACE_ID"

docker exec vozlab-redis redis-cli XLEN stream:node_created
```

A successful create returns `201` with the node id and `status: "PENDING"`.
The list response is `{ "nodes": [...], "nextCursor": ... }`. The stream length
increases because `NODE_CREATED` is published after the transaction commits.

## Tests and checks

```bash
pnpm test                                # Vitest, 24 files / 114 tests
pnpm turbo run build type-check          # src, tests and DB scripts
pnpm lint                                # known red: 26 pre-existing no-explicit-any errors
```

See [testing.md](testing.md) for scope, configuration and planned levels.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `403 ERR_TENANT_NOT_PROVISIONED` | Seed not run, or API/migrations point at different router DBs. | Run `db:seed:dev`; check `ROUTER_DB_NAME` is identical for migrate, seed and API. |
| Tables missing after `docker compose up` | Initdb scripts only run on a fresh volume. | `docker compose down -v`, then `up -d --build` and migrate again. |
| `db:migrate` fails with a TLS/SSL error | Custom drizzle config lacks `ssl: false`. | Keep `ssl: false` (both repo configs already set it); do not connect with forced TLS locally. |
| Env vars are `undefined` | `.env` is not at the repo root, the command bypasses the pnpm scripts, or `drizzle-kit` cannot see it. | Move `.env` to the root; run the API/seed/mint scripts; export `ROUTER_DB_*`/`TENANT_DB_*` before `db:migrate`. |
| Port already in use | Another Postgres/Redis/Ollama/API is running. | Stop it or remap the Compose port; update `.env` accordingly. |
| Postgres data appears in the wrong place | PG18 declares `VOLUME /var/lib/postgresql`; PGDATA is `/var/lib/postgresql/18/docker`. | Mount `/var/lib/postgresql`, not `/var/lib/postgresql/data`. |
| Minted token rejected with `ERR_INVALID_TOKEN` | `JWT_SECRET` differs between minting and the running API, token expired, or `authorHash` is missing. | Re-mint with the same shell that loaded the API's `.env`; dev tokens last 12h. |
| OIDC callback redirects with `error=ERR_INVALID_OIDC_STATE` | State expired (10 min), Redis was restarted, or the callback was replayed. | Restart at `/auth/login`; state is single-use. |
| OIDC callback redirects with `error=ERR_OIDC_EXCHANGE_FAILED` | Wrong client secret/redirect URI, issuer/audience mismatch, nonce mismatch or bad JWKS URL. | Compare the API log with the IdP client config; the API logs the token-endpoint status without the code. |
| `ERR_EMAIL_NOT_VERIFIED` after login | The IdP explicitly marks the email unverified. | Use an account with a verified institutional email. |
| `/auth/refresh` returns `401 ERR_REFRESH_TOKEN_INVALID` | Cookie absent (wrong origin/credentials), token expired, or an old token was replayed after rotation. | Call `/auth/refresh` from the PWA origin; on replay the whole family is revoked, so log in again. |
| `ERR_EVENT_EXPIRED` on a fresh code | Code expired/revoked, `ROUTER_DB_NAME` differs from the one used by `db:event-code`, or the code was mistyped. | Recreate with `db:event-code` against the API's router DB and check `expires_at`. |
| `429 ERR_RATE_LIMIT_EXCEEDED` | Write cap is 30/min per actor, or the workspace ceiling was hit. | Wait for the window or clear `vozlab:ratelimit:*` keys in dev. |
| Pretty logs despite JSON expectations | `LOG_PRETTY` uses `z.coerce.boolean()`, so the string `false` is truthy. | Leave `LOG_PRETTY` unset for JSON output. |
| `pnpm lint` fails on `no-explicit-any` | Known debt (26 errors), not a regression. | Treat build/type-check/tests as the gate until the debt is paid. |

The workers and PWA are empty scaffolds, and no embedding is computed today
(`nodes.embedding` stays `NULL`). See [testing.md](testing.md) for scope.
