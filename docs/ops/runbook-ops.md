# Operations Runbook (Current State)

What operators can actually observe and do today. Planned observability is
listed separately and is **not implemented**. Local setup lives in
[runbook-dev.md](runbook-dev.md).

## What exists

Health probes, pino JSON logs with `reqId`, the Redis token blacklist,
rate-limit buckets, best-effort Streams publication and graceful shutdown.
There are **no metrics, traces, dashboards or alerts**.

## Health endpoints

`GET /health/live` is process-only and does not touch dependencies:

```json
{ "status": "alive" }
```

`GET /health/ready` probes the **router** database (`SELECT 1`) and the Redis
connection used by the token blacklist:

```json
{ "status": "ready", "checks": { "database": "up", "redis": "up" } }
```

On failure it returns `503` with `"status": "degraded"` and the failing check
set to `"down"`.

Caveats:

- The tenant database and Ollama are **not** checked. Readiness can be `200`
  while a tenant DB is unreachable or the LLM is offline.
- `/health` is an alias of `/health/live`.
- Probe configuration must tolerate the API's startup time; there is no
  separate "starting" state.

## Logs

The API writes pino JSON to stdout. In production (`LOG_PRETTY` unset), one line
per event:

```json
{"level":"info","time":"2026-10-19T12:00:00.000Z","reqId":"...","msg":"incoming request","method":"GET","url":"/health/live"}
```

- `reqId` comes from the `x-correlation-id` request header, or a generated UUID.
- The response carries `X-Request-ID` with the same value.
- Every log call inside the request lifecycle picks up `reqId` from
  `AsyncLocalStorage`; the `NODE_CREATED` event payload also carries `reqId`.
- Sensitive paths are redacted: authorization/cookie headers, passwords,
  tokens, secrets.
- `LOG_LEVEL` accepts `fatal|error|warn|info|debug|trace`.
- `LOG_PRETTY=true` enables human-readable output for local development. The env
  parser uses `z.coerce.boolean()`, so the string `false` is truthy; leave the
  variable unset when JSON is required.

There is no log shipping, rotation or retention configuration in the repo.
Collection (Loki, CloudWatch, etc.) is an environment concern.

## Redis keys and streams

| Key pattern | Purpose | TTL |
| --- | --- | --- |
| `vozlab:blacklist:<jti>` | Revoked JWTs (value `1`) | Remaining token lifetime |
| `vozlab:ratelimit:<tenant>:<workspace>:<METHOD>:<actor>` | Per-actor fixed window | `ceil(RATE_LIMIT_WINDOW_MS / 1000)` |
| `vozlab:ratelimit:<tenant>:<workspace>:<METHOD>` | Coarse workspace ceiling | Same window |
| `vozlab:oidc:state:<state>` | Single-use OIDC state, nonce and PKCE verifier | 10 min |

Both Redis-backed guards fail open when their client is **not connected**:
tokens are treated as valid and rate limits are allowed. The rate limiter also
fails open on command errors; a blacklist command error is not caught and can
surface as a request failure. A Redis outage therefore weakens revocation and
abuse protection. The OIDC state store is different: login/callback fail with
`503 ERR_REDIS_CONNECTION_FAILED` rather than skipping state validation.
Refresh sessions live in the tenant DB, so a Redis outage does not invalidate
them.

### Published streams

The publisher maps a logical event to `stream:<lowercase event>` with `XADD *`.
All events are published **after** the DB transaction commits; publication
never throws and a broker failure only produces an error log.

| Stream(s) | Produced by |
| --- | --- |
| `stream:node_created`, `stream:node_deleted` | Node create/delete |
| `stream:edge_created`, `stream:edge_updated`, `stream:edge_deleted` | Edges |
| `stream:proposal_created`, `stream:proposal_approved`, `stream:proposal_rejected`, `stream:proposal_auto_applied` | Proposals |
| `stream:thread_created`, `stream:thread_closed`, `stream:post_created`, `stream:post_deleted` | Discussions |
| `stream:interaction_cast` | Votes |
| `stream:ontology_class_proposed`, `stream:ontology_class_activated`, `stream:ontology_property_proposed` | Ontology |

There are **three consumer groups** today: `embedder` and `relator` on
`stream:node_created`, and `extractor` on `stream:source_raw`. The shared
Python runtime also implements `XAUTOCLAIM` recovery, bounded attempts and a
dead-letter stream (`<stream>:dead`), which the workers use. The Consolidator
has no handler, and **nothing publishes `stream:source_raw` yet**. Streams are
never trimmed (`MAXLEN` is not set), so they grow without bound. There is no
replay or backfill tool.

## Worker containers

Each Python worker has a Dockerfile (`apps/worker-<name>/Dockerfile`) and a
compose service behind the `workers` profile:

| Service | Image | Stream / group |
| --- | --- | --- |
| `worker-embedder` | `vozlab/worker-embedder:dev` | `stream:node_created` / `embedder` |
| `worker-relacionador` | `vozlab/worker-relacionador:dev` | `stream:node_created` / `relator` |
| `worker-extractor` | `vozlab/worker-extractor:dev` | `stream:source_raw` / `extractor` |

```bash
docker compose --profile workers up -d --build worker-embedder
docker compose --profile workers ps
docker compose --profile workers logs -f worker-embedder
```

The images are Python 3.12 + uv, built with `uv sync --frozen` from the
repository root, and run as a non-root user. The API is **not** containerised
yet: the workers reach the host API through `host.docker.internal`, and the
API image lands in Phase 4 (4.6). There is no health endpoint, so
`docker compose ps` and the JSON logs are the only signals.

## Graceful shutdown

`SIGTERM` and `SIGINT` trigger Fastify `app.close()`, which:

1. Stops accepting new requests and drains in-flight handlers.
2. Disconnects the token blacklist, event publisher, rate limiter and OIDC
   state Redis clients.
3. Stops the tenant-pool cleanup interval and destroys all tenant pools.
4. Exits `0` on success, `1` on failure.

There is no explicit shutdown timeout; configure the orchestrator grace period
longer than the slowest in-flight request.

## Manual checks

`docker compose ps`, `curl /health/ready`, `redis-cli XLEN stream:node_created`,
`redis-cli XINFO GROUPS stream:node_created` (pending/lag of the `embedder`
and `relator` groups), `redis-cli XLEN stream:node_created:dead`
(dead-lettered entries), `redis-cli --scan --pattern 'vozlab:ratelimit:*'` and
`redis-cli --scan --pattern 'vozlab:oidc:state:*'` are the only current
signals. A leftover OIDC state key simply expires after 10 minutes.

## Serving the service worker

The PWA's service worker must **not** be cached by the layer in front of the
app. `adapter-node` computes the static `ETag` from the file size and the
mtime at startup, so a deploy that changes `sw.js` without changing its byte
length produces the same `ETag`; the browser revalidates, gets a `304` and
never sees the new worker — the update prompt never appears.

Serve `/sw.js` and `/manifest.webmanifest` with `Cache-Control: no-cache`.
In practice the hashed asset names change the length of the worker, so a
normal deploy is detected anyway; the header makes it certain.

## Not observable today

There is no `/metrics` endpoint, no Prometheus client, no OpenTelemetry SDK, no
distributed tracing, no dashboard definitions and no alert rules. Consequently
these alerts **cannot** be implemented with the current code:

| Desired alert | Why it is impossible |
| --- | --- |
| API error rate / p95 latency | No request metrics or histogram. |
| AGE/Cypher query latency > 50 ms | No query instrumentation. |
| Readiness failures over time | Only point-in-time HTTP responses; no scrape/history. |
| Rate-limit spikes or abusive actors | Only per-request warning logs. |
| Stream depth / consumer lag | Three consumer groups exist but there is no lag metric. |
| Dropped event publications | Only an error log line; no counter. |
| Tenant pool saturation | No pool metrics. |
| Ollama latency/errors | The embedder calls Ollama, but nothing is instrumented. |
| Worker failures/heartbeats | The three workers log JSON, but there is no heartbeat or metric. |

## Planned observability (Phase 4 — not implemented)

- HTTP RED metrics (rate, errors, duration) and DB pool metrics.
- Stream length/lag and worker heartbeat metrics once consumers exist.
- OpenTelemetry traces propagated with `reqId` across API, Redis and workers.
- Structured JSON logs in Python workers using the same correlation id. The
  shared runtime already emits JSON and binds `reqId` from `NODE_CREATED`; the
  embedder uses it, the other workers do not exist yet.
- Alerts for readiness failure, API error rate, AGE p95 > 50 ms, stream pending
  entries > 100, and Redis memory pressure.
- Dashboards for API, Postgres/AGE/pgvector, Redis and worker throughput.

See [architecture.md](../architecture.md) and [testing.md](../testing.md) for the
surrounding roadmap.


---

# Appendix — operational readiness before the first institution

> Lifted 2026-10-29 from `docs/archive/knowledge-transfer/14-process-communication-quality.md` §8.

## Operations: what must exist before the first institution uses the platform

Nothing below exists today. Each item is a document or a small procedure, and most are a half-day to write.

| Process | Minimum content | Owner |
| --- | --- | --- |
| Incident response | Severity levels; who is paged; the first fifteen minutes; how to communicate with the institution; the post-incident template | Engineer on duty |
| On-call | A rota (even if it is one person and a named backup); the alert routes | Engineering lead |
| Change management | How a change is approved for production; freeze windows around events and demonstrations; rollback procedure | Product owner and engineer |
| Backup and restore drill | Schedule; the restore steps per tenant (`05` §8); the measured time | Engineer |
| Access management | Who holds production credentials; how they are granted, reviewed and removed; the audit of access | Product owner |
| Vulnerability management | How advisories are triaged; timelines by severity; who decides on acceptance (`10` §6) | Engineer |
| Data subject requests | Intake, verification, response times, what can and cannot be erased (`05` §9) | Data steward |
| Breach response | Assessment, notification duties and timelines under the applicable law, contacts | Data protection officer |
| Supplier review | A short review of each external processor (cloud, model host, identity provider, email) | Product owner |
| Records of processing and impact assessment | One entry per data source and one for the AI pipeline (`09` §5) | Data steward |

**Jurisdiction.** The author's commit metadata and the development tenant name suggest a Colombian institutional context
[supuesto]. If so, the relevant framework is likely to include Ley 1581 de 2012 on personal data protection and its decrees,
with the national data protection authority as supervisor. Confirm with counsel. The obligations above are needed in any
jurisdiction, but the wording and the timelines depend on the law.
