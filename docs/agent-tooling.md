# Agent tooling

How the repository is wired for AI-assisted work: skills, subagents, slash
commands and MCP servers. The operating rules live in [../AGENTS.md](../AGENTS.md);
this page describes the machinery.

## Layout

| Path | What it holds | Tracked |
| --- | --- | --- |
| `opencode.json` | Project configuration: MCP servers and shell permissions | Yes |
| `.opencode/agents/*.md` | Subagent definitions (role, mode, permissions, system prompt) | Yes |
| `.opencode/commands/*.md` | Slash commands (`/next-task`, `/review-arch`) | Yes |
| `.agents/skills/*/SKILL.md` | Curated agent skills, one directory per skill | Yes |
| `skills-lock.json` | The provenance and content hash of every installed skill | Yes |
| `~/.config/opencode/opencode.json` | Machine-wide settings: model, provider, generic MCP servers | No (per user) |

OpenCode discovers `.opencode/agents/`, `.opencode/commands/` and
`.agents/skills/` automatically from the project root. The global
`opencode.json` holds only what is machine-specific — the model, the provider
and the MCP servers that are not tied to VozLab. Project configuration always
wins over global configuration for the same key.

## Agents

Ten agents, one per role of the engineering committee. Their system prompts
encode the repository invariants (NodeNext imports, the 404-on-cross-workspace
rule, timestamp ownership, the port vocabulary, the `tid` scoping rule), so a
subagent cannot drift from the conventions in `docs/conventions.md`.

| Agent | Mode | Role |
| --- | --- | --- |
| `architect` | `all` | Chief Software Architect: hexagonal boundaries, ADR authoring, code-vs-docs audits |
| `backend-ts` | `all` | Principal Full-Stack Engineer: Fastify API, Drizzle persistence, use cases |
| `backend-python` | `all` | Principal Database & AI Engineer: Python 3.12 workers, Redis Streams, Ollama pipeline |
| `frontend-svelte` | `all` | Principal Frontend Engineer: SvelteKit 5 PWA, Cytoscape canvas, offline shell |
| `qa-security` | `subagent` | Staff QA & Security Engineer: read-only security/PII/tenant review (edit is denied) |
| `reviewer` | `subagent` | Generic read-only diff review (edit is denied) |
| `database-dba` | `all` | Database & migrations: Drizzle folds (router/tenant), `_journal.json`, pooling, seeds, AGE/pgvector |
| `devops-deploy` | `all` | DevOps & deployment: compose profiles, T2/Caddy production, zrok demo, images, CI/Actions |
| `docs-governance` | `all` | Documentation lifecycle: plan open/close, archive purity, knowledge graduation, link/truth audits |
| `e2e-qa` | `all` | E2E & browser journeys: Playwright harness, task-13 graph realignment, k6 smoke |

`mode: all` means the agent can be selected as the session's main agent
(it appears in `/agents`) or launched as a subagent. `qa-security` and
`reviewer` are `subagent`-only by design — a read-only role must never drive
a session — so they do not appear in `/agents`; launch them with
"use the reviewer subagent …" and the parent's `subagent` permission selects
them.

Launch one explicitly, for example:

```text
Use the qa-security subagent to review the merge proposal lifecycle.
```

## Commands

| Command | Agent | Purpose |
| --- | --- | --- |
| `/next-task` | `build` | Take the next open task from the active plan (`docs/plans/`) else `ROADMAP.md`, implement it, validate the gate, mark it `[x]` with a one-line result |
| `/new-plan` | — | Open a versioned plan for one area (`docs/plans/<area>/vN.md`) from a ROADMAP item or a knowledge doc; clarifies scope, writes tasks with their evidence target, registers the pointer |
| `/close-plan` | — | Run a plan's closure checklist (evidence in living docs, ADRs, slivers re-homed, snapshot updated), then `git mv` it to `docs/archive/plans/` |
| `/review-arch` | `architect` | Hygiene + plan-health + code-vs-docs audit across `docs/`, `ROADMAP.md` and the ADRs, then fix the drift |
| `/docs-hygiene` | — | Run `scripts/docs-hygiene.sh` and repair links, heredoc artifacts, dead refs and process debris in place |

## MCP servers

Configured in `opencode.json`. Check the live state with:

```bash
opencode mcp list
```

| Server | Transport | Purpose in VozLab |
| --- | --- | --- |
| `postgres` | local (Docker) | Read-only SQL, schema inspection, `EXPLAIN` and index health over the dev tenant database. Closes the measurement gap behind NFR-01/02/03. |
| `playwright` | local (npx) | Drives a real browser through the accessibility tree: Phase 3 PWA work and the roadmap 3.7 / 4.3 E2E suites. |
| `github` | remote (OAuth-less, PAT) | CI runs, pull requests, Dependabot and code scanning alerts. |
| `chrome-devtools` | local (npx) | Network waterfall, console errors and performance traces on the PWA. Currently disabled (opt-in). |
| `brave-search` | local (npx) | Global. Web research. The rate limit is tight — one call at a time. |
| `context7` | remote | Global. Current library documentation for Fastify, Drizzle, SvelteKit, Vitest and Zod. |

### The Postgres server

It runs the **maintained** `crystaldba/postgres-mcp` image in
`--access-mode=restricted`. The original
`@modelcontextprotocol/server-postgres` reference server is deprecated and its
read-only mode was shown to be escapable; it must not be used.

The container reaches the host database through
`host.docker.internal` (`--add-host=host.docker.internal:host-gateway`), which
works both with the Compose stack and with a native PostgreSQL.

#### The reader role

The server does **not** connect as the superuser. It connects as
`mcp_reader`, a role with no capability beyond `SELECT`, provisioned by:

```bash
pnpm --filter @vozlab/database db:grant-mcp-reader
```

The script is idempotent and self-testing. It provisions the role, then
proves the guarantee instead of asserting it:

| Check | Expected result |
| --- | --- |
| `SELECT` on `public.nodes` | rows returned |
| `SELECT` on the catalog schemas | migrations and AGE graph readable |
| `INSERT` on `public.nodes` | `cannot execute INSERT in a read-only transaction` |
| `SELECT` on `auth.refresh_tokens` | `permission denied` |
| `CONNECT` to the router database | `permission denied for database` |

The enforcement is in PostgreSQL, not in the MCP:

- `default_transaction_read_only = on` on the role — every session is a
  read-only transaction, so a write is rejected by the engine even when it
  arrives through a path the MCP's own SQL validator would not catch.
- `SELECT` is the only table privilege. There is no `INSERT`/`UPDATE`/
  `DELETE` to escalate to.
- `statement_timeout = 30s` and `idle_in_transaction_session_timeout = 60s`.
- `CONNECT` on the router database is revoked from `PUBLIC` and not granted
  to the role. The router holds `tenant_connections.password` in clear text
  and must stay out of reach.
- `auth.refresh_tokens` is revoked explicitly: hashed refresh tokens have no
  API surface that exposes them, so a read-only analytical role has no
  business reading them.

The reader sees the `auth`, `meta`, `public` and `social` schemas plus the
`drizzle` and `ag_catalog` catalog schemas. The `vozlab_graph` AGE mirror is
**not** granted: it is empty while AGE mirroring is deferred (ADR-0004).

The connection URI is:

```text
postgresql://mcp_reader:vozlab_mcp_local@host.docker.internal:5432/vozlab_tenant_dev
```

The password is a development credential, in the same category as the
`postgres:postgres` pair already published in `.env.example` and
`docker-compose.yml`. To change it, set `MCP_READER_PASSWORD`, re-run
`db:grant-mcp-reader` (it prints the URI it provisioned) and update
`mcp.servers.postgres.environment.DATABASE_URI` in `opencode.json`.

**Tenant isolation is physical.** Whatever database the server points at
contains the data of every tenant hosted there. Point it at a development
database, never at a production tenant.

#### Verifying the setup (from a fresh clone or machine)

Run these four checks in order. All must pass before trusting the server;
the exact same assertions were verified on 2026-10-28.

```bash
# 0. Prerequisites: the dev stack is up and the role exists
docker ps --format '{{.Names}}' | grep -q vozlab-postgres || \
  echo "FATAL: docker compose up -d postgres redis first"
docker exec -e PGPASSWORD=vozlab_mcp_local vozlab-postgres \
  psql -U mcp_reader -h 127.0.0.1 -d vozlab_tenant_dev -c "SELECT 1;" >/dev/null 2>&1 || \
  pnpm --filter @vozlab/database db:grant-mcp-reader

# 1. The session is on the tenant DB, as the reader role
opencode mcp list   # postgres should be connected
# then, through the MCP itself:
#   SELECT current_database(), current_user;
#   -> vozlab_tenant_dev | mcp_reader

# 2. Denied table: permission denied (engine-level, not just the validator)
#   SELECT count(*) FROM auth.refresh_tokens;   -> permission denied

# 3. Engine-level read-only and router isolation (bypasses the MCP validator)
docker exec -e PGPASSWORD=vozlab_mcp_local vozlab-postgres psql \
  -U mcp_reader -h 127.0.0.1 -d vozlab_tenant_dev \
  -c "INSERT INTO public.nodes (id) VALUES (gen_random_uuid());"
#   -> ERROR: cannot execute INSERT in a read-only transaction
docker exec -e PGPASSWORD=vozlab_mcp_local vozlab-postgres psql \
  -U mcp_reader -h 127.0.0.1 -d vozlab_router -c "SELECT 1;"
#   -> FATAL: permission denied for database "vozlab_router"
```

Defense layers, outermost first:

1. `--access-mode=restricted` — the MCP validator refuses DDL/DML outright
   ("Error validating query"), so most mistakes never reach the server.
2. `default_transaction_read_only` — even a query that slips past the
   validator is rejected by the engine.
3. Privileges — `SELECT` only, `auth.refresh_tokens` revoked, no `CONNECT`
   on `vozlab_router` (it holds the tenant connection passwords).

When an agent calls the MCP from code mode, the tools live under
`tools.postgres` (`execute_sql`, `list_objects`, `get_object_details`,
`analyze_db_health`, …). They are **not** callable as top-level tool names.

### The GitHub server

It is a remote server using a personal access token. The token is read from
the environment, so it is never committed:

**The token does not go in the repo `.env`.** OpenCode V2 substitutes
`{env:VAR}` only from the service process environment and never loads `.env`
for it (an unset variable becomes an empty string, which surfaces as
"Authorization header is badly formatted"). The working pattern is the
`{file:}` substitution documented for config variables:

```bash
printf '%s' 'github_pat_…' > ~/.config/opencode/github-pat   # no trailing newline
chmod 600 ~/.config/opencode/github-pat
```

and in `opencode.json`:
`"Authorization": "Bearer {file:~/.config/opencode/github-pat}"`.
Config is watched — `opencode mcp list` goes from `failed` to `connected`
without a restart. Rotate by rewriting the file. The PAT is a fine-grained
token scoped to `Juanc0/vozlab` with Contents + Actions + Pull requests +
Issues (read/write). The VozLab remote is `github.com/Juanc0/vozlab`
(SSH for push/pull); the MCP uses HTTPS with this token for the
Actions/PR/issues APIs.

Without the variable the server cannot authenticate and `opencode mcp list`
reports it as failed. The `X-MCP-Toolsets` header keeps the registered tool
count small — the full server registers far more tools than a session should
carry.

## Skills

The curated set lives in `.agents/skills/`, one directory per skill, each with
a `SKILL.md`. `skills-lock.json` records the upstream source, the path inside
it and the SHA-256 of the installed `SKILL.md`, so a re-install can be checked
for drift.

A skill is advertised to the model when it has a `description` and does not
set `metadata.opencode/autoinvoke: false` or `disable-model-invocation: true`.
A skill without a description is never advertised.

**Methodology skills (installed 2026-10-29).** `writing-plans`, `executing-plans`,
`subagent-driven-development`, `dispatching-parallel-agents`, `brainstorming`,
`requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`,
`test-driven-development`, `systematic-debugging`, `verification-before-completion`
(obra/superpowers), plus `reducing-entropy` (joshuadavidthomas/agent-skills) for
design/code audit and `writing-documentation-with-diataxis` (sammcj/agentic-coding)
for documentation classification. Each carries a **`## VozLab wiring`** block that
overrides its upstream defaults to our lifecycle: plans live in
`docs/plans/<area>/vN.md` (never `docs/superpowers/plans/`), a checkpoint is a
gate-green commit, verification means pasted command output. `caddy` and
`caddy-reverse-proxy` support the T2 proxy. The upstream sources were installed
into a sibling folder first and are vendored here (lock `sourceType: github`);
delete the sibling copy once satisfied.

The rest of the set is grouped by the phase it supports: architecture (`hexagonal-architecture`,
`multi-tenant-architecture`, `graph-database-expert`, `adr-authoring`,
`api-contract-design`), backend and frontend (`fastify-best-practices`,
`drizzle`, `svelte5-best-practices`, `tailwind-design-system`,
`docker-compose`), the Python runtime (`pytest-patterns`, `pytest-coverage`),
and quality (`vitest`, `testcontainers`, `contract-testing`,
`owasp-security-review`, `agent-owasp-compliance`, `k6-load-testing`,
`playwright` guidance, `accessibility-audit`, `github-actions-cicd`,
`opentelemetry`, `prometheus-configuration`).

## Related

- [../AGENTS.md](../AGENTS.md) — the operating rules for the agent.
- [../CLAUDE.md](../CLAUDE.md) — the working agreement and the committee roles.
- [conventions.md](conventions.md) — the code conventions the agents enforce.
- [testing.md](testing.md) — the test layers the skills map onto.


---

# Appendix — agent-work risks and rules

> Lifted 2026-10-29 from `docs/archive/knowledge-transfer/14-process-communication-quality.md` §9.3–§9.4.

### 9.3 Risks

| Risk | Example in this repository | Control |
| --- | --- | --- |
| Credentials in configuration | `opencode.json` contains a database password (F-06) | Secret scanning; references to environment variables only |
| Unreviewed generated code in sensitive paths | Authorisation and tenancy code can be changed by an agent in one session | Human review of those paths (section 3) |
| Document drift | Counts and statuses are typed by hand (section 5) | Generated numbers |
| Over-large skill catalogue | 56 skills plus copies; some for technologies the project does not use (for example, iOS design) | Curate to what the project uses; keep one canonical copy |
| Scope creep | A graph canvas consumed most of one week while governance was not on the board (`02` §6) | The roadmap must show the product-critical items at the top, and an explicit rule that governance items take precedence |
| Dependence on a tool version | Agent behaviour changes with tool versions | Pin tool versions in the repository where possible |

### 9.4 Rules to keep the benefit and remove the risk

1. Commits produced with agent help say so in a trailer, so that the review knows where to look.
2. Changes to authentication, authorisation, tenancy, data retention and AI write paths require a human reviewer.
3. No secret ever appears in a tracked file, including agent configuration.
4. The security reviewer agent's findings are recorded; accepted risks are written down with the reason.
5. The skill catalogue is reduced to what the project uses; duplicates are generated, not copied.
