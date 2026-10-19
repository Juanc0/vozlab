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
| `OIDC_CLIENT_ID/SECRET/REDIRECT_URI/AUTH_URL/TOKEN_URL/USERINFO_URL` | Yes | Client id/secret required; URLs validated at boot. Auth endpoints are not built, so no IdP is needed locally. |
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
This is an interim developer tool: FR-01/02/03 auth endpoints do not exist yet.

### 7. Start the API

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
pnpm test                                # Vitest, 15 files / 60 tests
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
| Minted token rejected with `ERR_INVALID_TOKEN` | `JWT_SECRET` differs between minting and the running API, token expired, or `authorHash` is missing. | Re-mint with the same shell that loaded the API's `.env`; tokens last 12h. |
| `429 ERR_RATE_LIMIT_EXCEEDED` | Write cap is 30/min per actor, or the workspace ceiling was hit. | Wait for the window or clear `vozlab:ratelimit:*` keys in dev. |
| Pretty logs despite JSON expectations | `LOG_PRETTY` uses `z.coerce.boolean()`, so the string `false` is truthy. | Leave `LOG_PRETTY` unset for JSON output. |
| `pnpm lint` fails on `no-explicit-any` | Known debt (26 errors), not a regression. | Treat build/type-check/tests as the gate until the debt is paid. |

The workers and PWA are empty scaffolds, and no embedding is computed today
(`nodes.embedding` stays `NULL`). See [testing.md](testing.md) for scope.
