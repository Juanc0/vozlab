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

Ollama is started but no model is pulled. The embedder worker needs
`nomic-embed-text` (768 dims); the reasoning models for the other agents are
not used yet:

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

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
(`33333333-3333-4333-8333-333333333333`), five dev identities, the ACTIVE
ontology classes `Problem`, `Idea`, `Resource` and one example data source
(`dev-minutes-2026`).

It also writes the **demo graph**: 24 nodes and 35 relations in Spanish,
arranged in three independent clusters — *movilidad y transporte*, *espacios
y accesibilidad* and *vida académica y bienestar* — plus 4 proposals, 3
discussion threads with 10 posts and 71 votes. The ontology grows with it:
the relations `INVOLVES`, `ADDRESSES`, `BUILDS_ON` and `EVIDENCED_BY` join
`RELATES_TO`, and the classes carry the datatype properties that drive the
dynamic node form (`sector`, `alcance`, `horizonte`, `costoEstimado`,
`enlace`, `tipoFuente`).

> **`db:seed:dev` is a reset button.** It deletes the workspace content it
> does not own — anything a previous run or the E2E suite left behind — and
> prints what it removed. The demo is therefore deterministic, and running
> it before a presentation restores the pristine graph.

The nodes are authored by the **maintainer** identity and the proposals are
put forward by the **member**, so the presenter, signed in as the author, is
exactly the person who can approve them. One of the pending proposals is
older than 14 days with a score of 12, which is what the moderator's
auto-apply path needs.

### 6. Mint a development JWT

```bash
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer | awk '/^eyJ/')
echo "$TOKEN"
```

Available identities: `maintainer`, `moderator`, `member`, `agent`, `embedder`.
The `embedder` identity carries the agent type `AGENT_EMBEDDER` and may only
call `PUT /api/v1/nodes/:id/embedding`. Tokens are HS256, valid for 12 hours,
and signed with the `JWT_SECRET` the API boots with.
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

### 8. Run the embedder worker (optional)

Phase 2 has a shared Python runtime and the dedicated embedder: it consumes
`stream:node_created`, asks Ollama for the 768-dimensional `nomic-embed-text`
vector and stores it through the agent-only API route. Python 3.12 and uv are
required; run from the repo root so the root `.env` is visible.

```bash
uv sync
uv run pytest
uv run ruff check packages/worker-shared apps/worker-embedder

# Validate configuration and the credential source, then exit
AGENT_TOKEN="$(pnpm --filter @vozlab/database db:mint-token -- --as embedder | awk '/^eyJ/')" \
  uv run vozlab-worker-embedder --check
```

Run it (foreground) against the local stack:

```bash
AGENT_TOKEN="$(pnpm --filter @vozlab/database db:mint-token -- --as embedder | awk '/^eyJ/')" \
API_BASE_URL=http://localhost:3000 \
REDIS_URL=redis://localhost:6379/0 \
OLLAMA_BASE_URL=http://localhost:11434 \
WORKSPACE_ID=33333333-3333-4333-8333-333333333333 \
  uv run vozlab-worker-embedder
```

`--once` processes the current batch (plus stale pending entries) and exits —
useful for smoke tests and for re-embedding after a model change. `SIGTERM` /
`SIGINT` stop the consumer gracefully.

The worker needs the Ollama model (`docker compose exec ollama ollama pull
nomic-embed-text`) and the API running. Check the result:

```bash
docker exec vozlab-postgres psql -U postgres -d vozlab_tenant_dev \
  -c "select id, embedding_model, embedded_at, embedding is not null as embedded
      from public.nodes order by created_at desc limit 5;"
```

`uv sync` uses the repo-root `.venv`; do not keep unrelated Python packages in
that environment.

### 9. Run the Relator worker (optional)

The Relator (Agent 2) consumes the same stream with its own group (`relator`),
asks the API for the closest nodes, asks the local LLM for a verdict and
proposes a `PENDING` edge.

```bash
# Validate configuration and the credential source, then exit
AGENT_TOKEN="$(pnpm --filter @vozlab/database db:mint-token -- --as agent | awk '/^eyJ/')" \
  uv run vozlab-worker-relacionador --check
```

Run it (foreground) against the local stack:

```bash
AGENT_TOKEN="$(pnpm --filter @vozlab/database db:mint-token -- --as agent | awk '/^eyJ/')" \
API_BASE_URL=http://localhost:3000 \
REDIS_URL=redis://localhost:6379/0 \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_CHAT_MODEL=llama3.1:8b \
WORKSPACE_ID=33333333-3333-4333-8333-333333333333 \
  uv run vozlab-worker-relacionador
```

The dev seed's `agent` identity carries `type=AGENT_EXTRACTOR`; the API accepts
it for the Relator's reads and edge creation, but a dedicated
`AGENT_RELACIONADOR` token is the production shape.

`--once` processes the current batch and exits. Check the result:

```bash
docker exec vozlab-postgres psql -U postgres -d vozlab_tenant_dev \
  -c "select relation_key, status, s.title as source, t.title as target
      from public.edges e
      join public.nodes s on s.id = e.source_node_id
      join public.nodes t on t.id = e.target_node_id;"
```

A `MERGE` verdict is submitted as a **merge proposal** (`POST /api/v1/proposals`
with `kind: "MERGE"`), not applied by the bot
([ADR-0026](decisions/ADR-0026-merge-contract.md)). Check the proposals:

```bash
docker exec vozlab-postgres psql -U postgres -d vozlab_tenant_dev \
  -c "select id, kind, status, target_id, proposed_changes
      from public.edit_proposals where kind = 'MERGE';"
```

Approving one (as the duplicate's author) applies the merge: the duplicate
becomes `MERGED` and points at the survivor, the survivor adopts what it does
not have and the duplicate's edges are re-pointed.

### 10. Run the Extractor worker (optional)

The Extractor (Agent 1) consumes `stream:source_raw`, masks the PII locally,
asks the local LLM for a draft node and creates it through the API. **Nothing
publishes `stream:source_raw` yet** — the ingestion gateway is missing — so
publish a record by hand to try it:

```bash
docker exec vozlab-redis redis-cli XADD stream:source_raw '*' \
  sourceId dev-minutes-2026 connectorType MINUTES channelName meeting-minutes \
  rawContent "Ana Torres (ana.torres@example.edu) reported that the campus shuttle leaves every hour."

AGENT_TOKEN="$(pnpm --filter @vozlab/database db:mint-token -- --as agent | awk '/^eyJ/')" \
API_BASE_URL=http://localhost:3000 REDIS_URL=redis://localhost:6379/0 \
OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_CHAT_MODEL=llama3.1:8b \
  uv run vozlab-worker-extractor --once
```

The created node is `PENDING` and its text contains `[MASKED]` instead of the
identifiers.

### 11. Run the workers in containers (optional)

Each worker has a Dockerfile and a compose profile. The API still runs on the
host, so the containers reach it through `host.docker.internal`:

```bash
docker compose --profile workers up -d --build worker-embedder worker-relacionador worker-extractor
docker compose --profile workers logs -f worker-embedder
```

The images are built with `uv sync --frozen` from the repository root, so an
outdated `uv.lock` fails the build instead of resolving something new. In
production the workers get `AGENT_TOKEN`/`AGENT_TOKEN_FILE` instead of the
development minting path.

### 12. Start the API

```bash
pnpm --filter @vozlab/api dev
```

`dev` runs `tsx watch` against TypeScript sources. `start` also runs from source;
there is no emitted `dist/`.

### 13. Start the PWA (optional)

```bash
pnpm --filter @vozlab/web dev
```

The dev server listens on **5173**, which is the `WEB_ORIGIN` the API already
expects for CORS. It talks to the API at `http://localhost:3000/api/v1` by
default; override it at runtime with `PUBLIC_API_BASE_URL`:

```bash
PUBLIC_API_BASE_URL=https://api.vozlab.example/api/v1 pnpm --filter @vozlab/web dev
```

The value is read on the server (`$env/dynamic/public`), so a built image can be
re-pointed at another API without a rebuild.

The production build is a standalone Node server:

```bash
pnpm --filter @vozlab/web build
PORT=5173 node apps/web/build/index.js
```

It serves the SSR app, `/manifest.webmanifest` and the service worker. The
worker runs in `prompt` mode: a new version waits until the user accepts the
reload, so assets are never swapped silently mid-session.

> The login page, the event-code join and the workspace selector exist
> (roadmap 3.3), and so do the graph canvas (3.4), the governance screens
> (3.5) and the offline shell (3.6). See [spec/web-pwa.md](spec/web-pwa.md).

> **A production build stops the dev server.** `pnpm --filter @vozlab/web
> build` empties `apps/web/dev-dist/`, which is the directory the dev server
> serves the development service worker from; the server then dies with an
> `ENOENT … dev-dist/sw.js` behind the Vite overlay. Restart it
> (`pnpm --filter @vozlab/web dev`) after a build, or run the two in
> different terminals.

### 14. Sign in to the PWA locally

The PWA keeps the access token in memory and the refresh token in an
`HttpOnly` cookie, so it needs a real session. `db:mint-token` cannot open
one — a minted token has no refresh cookie — so local development uses the
**event-code join**:

```bash
pnpm --filter @vozlab/database db:event-code
# Raw code (only shown once — put this in the QR):
#   vle__x8dvtIachq8pUjGxGCQ_Q1y
```

Open <http://localhost:5173/join>, paste the code and submit. The API
consumes the code, creates an anonymous event user with a workspace
membership, sets the refresh cookie and returns the session; the PWA adopts
it and lands in the app with the workspace selected.

The `/login` page starts the real OIDC flow, which needs an identity
provider. None runs in Compose, so locally it is the event-code path above.

### 15. Present as a dev identity

The event code grants the `MEMBER` role, and a member can neither approve a
proposal nor auto-apply one: the approval belongs to the **author of the
target** and the auto-apply to a moderator. The seeded graph is authored by
the maintainer, so a presenter who signs in with an event code can look at
the governance screens but not act on them.

The login page of a **development build** therefore offers a development
sign-in: paste a token minted locally and the app adopts it as the session.

```bash
pnpm --filter @vozlab/database db:mint-token -- --as maintainer
# paste the token into the login page
```

The identities and what each of them can do:

| Identity | Workspace role | Can do |
| --- | --- | --- |
| `maintainer` | `ADMIN` | approve and reject the proposals of the seeded nodes; auto-apply |
| `moderator` | `MODERATOR` | auto-apply the proposals that are old and scored enough |
| `member` | `MEMBER` | propose corrections, discuss, vote |

The token is verified by the API, not by the browser: an expired or revoked
one is rejected with a `401` and the panel says so. It is kept in
`sessionStorage` so a reload does not cost the presenter the role, and that
path exists only in a development build — a production bundle has no such
code. The sign-out takes it away.

> The demonstration runs against the **development server**
> (`pnpm --filter @vozlab/web dev`). The panel is not in a production build.

The API half can be exercised without any of this:

```bash
TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as maintainer \
  | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
```

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
pnpm test                                # unit suite: 29 API files / 159 tests + 4 web files / 16 tests
pnpm turbo run build type-check          # src, tests, DB scripts and the web app
pnpm lint                                # known red: 24 pre-existing no-explicit-any errors

# Opt-in auth integration suite (requires the running DB, migrations and seed)
pnpm --filter @vozlab/api test:integration

# Python worker runtime (105 tests; no live Redis/Ollama/API)
uv sync
uv run pytest
```

The integration suite starts the API on `13000`, a mock OIDC provider on
`18080`, and uses the local PostgreSQL/Redis from Compose. It creates and
deletes its own users and event codes; never point it at production. See
[testing.md](testing.md) for scope, configuration and planned levels.

## Agent tooling (optional)

The AI assistants used on this repository read the database through a
dedicated read-only role instead of the superuser. Provision it once after
migrating and seeding:

```bash
pnpm --filter @vozlab/database db:grant-mcp-reader
```

The script is idempotent and prints the connection URI it provisioned. The
role can only `SELECT` from the tenant database: writes are rejected by
PostgreSQL itself (`default_transaction_read_only = on`), the hashed refresh
tokens in `auth.refresh_tokens` are revoked, and `CONNECT` on the router
database is refused, so the tenant connection passwords stay unreachable.

Keep the URI in sync with `mcp.servers.postgres.environment.DATABASE_URI` in
`opencode.json`. To use a different password, set `MCP_READER_PASSWORD` in
the root `.env` before running the script. The full description of the role,
the MCP servers, the subagents and the skills is in
[agent-tooling.md](agent-tooling.md).

The GitHub MCP server reads its token from the process environment, not from
`.env`:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...   # scopes: repo, read:org
```

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
| `test:integration` fails to connect or boot | Compose services are down, migrations/seed are missing, or ports `13000`/`18080` are taken. | Start Postgres/Redis, run `db:migrate` + `db:seed:dev`, free the ports or override `INTEGRATION_API_PORT`/`MOCK_OIDC_PORT`. |
| `429 ERR_RATE_LIMIT_EXCEEDED` | Write cap is 30/min per actor, or the workspace ceiling was hit. | Wait for the window or clear `vozlab:ratelimit:*` keys in dev. |
| Pretty logs despite JSON expectations | `LOG_PRETTY` uses `z.coerce.boolean()`, so the string `false` is truthy. | Leave `LOG_PRETTY` unset for JSON output. |
| `pnpm lint` fails on `no-explicit-any` | Known debt (24 errors), not a regression. | Treat build/type-check/tests as the gate until the debt is paid. |
| Worker `--check` says `missing agent identity` | `JWT_SECRET` is set but no static token and no `AGENT_*` identity is configured. | Set `AGENT_TOKEN`/`AGENT_TOKEN_FILE`, or set `AGENT_TENANT_KEY`, `AGENT_USER_ID` and `AGENT_AUTHOR_HASH` for development minting. |
| `GET /api/v1/ingestion/resolve-source` answers 404 | The source is not in `meta.data_sources`, or it is `INACTIVE`. The registry has no management route yet. | Insert the row (or re-run `db:seed:dev` for the `dev-minutes-2026` example) with an `ACTIVE` status. |
| Embedder logs `401 ERR_INVALID_TOKEN` | The token was minted with a different `JWT_SECRET` than the running API, or the API is running an older build without `AGENT_EMBEDDER` in the allow-list. | Re-mint with the API's `JWT_SECRET` and restart the API after changing `packages/shared-types`. |
| Embedder logs `403 ERR_AUTHORIZATION_FAILED` | The token is not an `AGENT_EMBEDDER` token. | Mint with `--as embedder` (not `--as agent`). |
| Embedder dead-letters a node | The node was deleted, the model did not match `EMBEDDING_MODEL`, or the API rejected the vector. | Inspect `stream:node_created:dead`; the entry carries the original payload, the error and the attempt count. |
| `uv sync` replaced an unrelated `.venv` | uv uses the repo-root `.venv` as the workspace environment. | Keep the root `.venv` dedicated to this workspace; use a separate checkout/environment for unrelated Python projects. |

The three AI worker apps are still empty scaffolds; the embedder exists and
computes vectors for new nodes, but there is no backfill for older ones and
nothing queries `nodes.embedding` yet. See [testing.md](testing.md) for scope
and [ADR-0020](decisions/ADR-0020-dedicated-embedding-pipeline.md) /
[ADR-0021](decisions/ADR-0021-python-worker-runtime.md) for the design.
