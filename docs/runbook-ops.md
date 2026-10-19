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

Both Redis-backed guards fail open when their client is **not connected**:
tokens are treated as valid and rate limits are allowed. The rate limiter also
fails open on command errors; a blacklist command error is not caught and can
surface as a request failure. A Redis outage therefore weakens revocation and
abuse protection.

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

There are **no consumers and no consumer groups** today, including
`stream:node_created`. Streams are never trimmed (`MAXLEN` is not set), so they
grow without bound. There is also no replay or dead-letter mechanism.

## Graceful shutdown

`SIGTERM` and `SIGINT` trigger Fastify `app.close()`, which:

1. Stops accepting new requests and drains in-flight handlers.
2. Disconnects the token blacklist, event publisher and rate limiter Redis
   clients.
3. Stops the tenant-pool cleanup interval and destroys all tenant pools.
4. Exits `0` on success, `1` on failure.

There is no explicit shutdown timeout; configure the orchestrator grace period
longer than the slowest in-flight request.

## Manual checks

`docker compose ps`, `curl /health/ready`, `redis-cli XLEN stream:node_created`
and `redis-cli --scan --pattern 'vozlab:ratelimit:*'` are the only current
signals. A growing stream with no consumer is expected today.

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
| Stream depth / consumer lag | No worker consumers and no lag metric. |
| Dropped event publications | Only an error log line; no counter. |
| Tenant pool saturation | No pool metrics. |
| Ollama latency/errors | No calls from the current API; no instrumentation. |
| Worker failures/heartbeats | Workers are not implemented. |

## Planned observability (Phase 4 — not implemented)

- HTTP RED metrics (rate, errors, duration) and DB pool metrics.
- Stream length/lag and worker heartbeat metrics once consumers exist.
- OpenTelemetry traces propagated with `reqId` across API, Redis and workers.
- Structured JSON logs in Python workers using the same correlation id.
- Alerts for readiness failure, API error rate, AGE p95 > 50 ms, stream pending
  entries > 100, and Redis memory pressure.
- Dashboards for API, Postgres/AGE/pgvector, Redis and worker throughput.

See [architecture.md](architecture.md) and [testing.md](testing.md) for the
surrounding roadmap.
