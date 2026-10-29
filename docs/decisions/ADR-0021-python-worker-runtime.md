# ADR-0021: Python 3.12 workers with a shared uv runtime and Redis Streams

- Status: Accepted
- Date: 2026-10-19

## Context

Phase 2 adds several Python processes (Extractor, Relator, Consolidator and the
dedicated embedder from ADR-0020). Without a shared runtime each worker would
reinvent configuration, JSON logging, agent-token handling, HTTP calls and
Redis Streams recovery. That duplication is where silent data loss tends to
appear: an unacknowledged message left forever, a retry storm, or a correlation
id lost between the stream and the API.

The repository currently has three empty worker directories and no Python
package. The host has Python 3.12 available through `uv`, and the project
already standardises on pnpm for TypeScript. The worker runtime must not add
Node build steps or a second dependency-manager convention without a reason.

Alternatives considered:

- **Celery/RQ workers.** These add a broker-specific abstraction and a larger
  dependency footprint; the system already uses Redis Streams and needs PEL
  recovery semantics that map directly to `XREADGROUP`/`XAUTOCLAIM`.
- **Async Python throughout.** Redis and HTTP clients support asyncio, but the
  workers are I/O-bound and synchronous code is simpler to reason about for
  ordered stream handling and retries. A sync runtime is sufficient for the
  expected throughput; an async migration would be a new decision.
- **One shared consumer group for all workers.** This would make a node event
  go to only one worker type, losing the fan-out the Relator and embedder need.
- **Direct database writes from workers.** Rejected by the API-only write rule
  and by ADR-0020.
- **No shared library.** Each worker would duplicate retry, auth and stream
  logic; the first bug would be fixed three times or not at all.

## Decision

### 1. Runtime and dependency management

- Workers target **Python 3.12** (`>=3.12,<3.13`) and use **uv** with a
  workspace-level `pyproject.toml` and `uv.lock`.
- Shared code lives in `packages/worker-shared` (distribution name
  `vozlab-worker`, import package `vozlab_worker`).
- Each worker is its own package under `apps/worker-*` and depends on the
  shared package through the uv workspace.
- Tests use **pytest**; Redis is faked with **fakeredis**; HTTP is faked with
  `httpx.MockTransport`. No test requires a live Redis, Ollama or API.
- `ruff` is the formatter/linter for Python. The Python suite is not part of
  the Turbo task graph in this milestone; Phase 2.7 adds CI and image builds.

### 2. Configuration

`pydantic-settings` loads environment variables; the root `.env` is a
development convenience, not a production requirement. Canonical names:

| Group | Variables |
| --- | --- |
| Logging | `LOG_LEVEL` (`INFO` default) |
| Redis | `REDIS_URL` (`redis://localhost:6379/0`), `STREAM_*` |
| API | `API_BASE_URL`, `API_TIMEOUT_SECONDS`, `WORKSPACE_ID` |
| Agent | `AGENT_TYPE`, `AGENT_TENANT_KEY`, `AGENT_USER_ID`, `AGENT_AUTHOR_HASH` |
| Credentials | `AGENT_TOKEN`, `AGENT_TOKEN_FILE`, `JWT_SECRET` (development only), `AGENT_TOKEN_TTL_SECONDS` |
| Embedder | `OLLAMA_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` |

The runtime's credential factory fails fast on a missing/invalid agent identity
or a missing credential source; the app calls it during startup validation.
`AGENT_TOKEN` takes precedence over
`AGENT_TOKEN_FILE`, which takes precedence over development minting with
`JWT_SECRET`. The last path exists only for local development and tests, mirroring
`db:mint-token`; production deployments should mount a token file (or, later,
use a dedicated credential service).

### 3. Agent identity and token refresh

Workers authenticate to the API with HS256 agent JWTs. Claims are `sub`, `tid`,
`jti`, `authorHash` and `type` (one of the allow-listed `AGENT_*` values). The
shared runtime provides:

- `StaticTokenProvider` for a token injected by the orchestrator.
- `FileTokenProvider`, which re-reads a mounted token on every request so an
  operator can rotate it without restarting the worker.
- `DevTokenProvider`, which mints and re-mints a short-lived token with
  `JWT_SECRET` when no static credential is configured. It refreshes before
  expiry; it is never the production path.

There is no new agent-token HTTP endpoint in this milestone. Agent credential
issuance/rotation beyond a mounted file remains an open operational topic; the
API still accepts the same JWT contract that `db:mint-token` produces.

### 4. API client

`ApiClient` is a synchronous `httpx` wrapper that:

- injects `Authorization: Bearer <token>`, `X-Workspace-ID` when supplied, and
  `x-correlation-id` (from the stream event or the logging context);
- maps non-2xx responses to a typed `ApiError` with status, code and message;
- retries only transport errors and `429/5xx` when the caller explicitly marks
  a request retryable. Mutating calls are not retried automatically, because
  the API does not yet provide an idempotency-key contract.

### 5. Redis Streams consumption

Workers use one consumer group **per worker type**: `extractor`, `embedder`,
`relator`, `consolidator`. This gives every worker type its own copy of an
event. The group is created at `0-0` so a newly deployed worker processes
existing stream history instead of silently skipping it.

The shared consumer:

- reads with `XREADGROUP` using a bounded `COUNT` and `BLOCK`;
- recovers idle entries with `XAUTOCLAIM`, never assuming a restarted consumer
  inherits the PEL;
- calls the handler and sends `XACK` only after the handler returns;
- leaves retryable failures pending, with capped exponential backoff in the
  handler/client;
- after `STREAM_MAX_ATTEMPTS` deliveries, copies the message to
  `<stream>:dead` with the original fields, error and attempt count, then
  acknowledges it. Permanent failures (`PermanentError`) go to the dead-letter
  stream immediately;
- logs JSON lines with `stream`, `message_id`, `consumer`, `correlation_id`,
  attempts and outcome.

Handlers are responsible for deduplication/idempotency. The stream runtime
provides at-least-once delivery, not exactly-once.

### 6. Correlation and logging

`x-correlation-id` is read from the event's `reqId` when present (or generated
for events without one), bound to a `ContextVar`, and injected by the API
client. Logs are JSON to stdout and include the correlation id, so one event can
be followed from `NODE_CREATED` to the worker's API call.

## Consequences

### Positive

- One place to fix PEL recovery, retries, auth and logging for all workers.
- Worker packages stay small and testable without infrastructure.
- Consumer-group fan-out matches the event topology: embedder and Relator both
  see `NODE_CREATED`.
- The same runtime can serve the Extractor, Relator, Consolidator and embedder.

### Negative / costs

- A second language toolchain (uv/Python) enters the repository; CI and image
  builds must be added in 2.7.
- Shared-library changes can affect every worker; semantic versioning is not
  used inside the workspace.
- Agent credential rotation in production is still file-based; a dedicated
  credential service is future work.
- At-least-once delivery plus no server-side idempotency still allows duplicate
  proposals or duplicate embedding writes (the latter is harmless because the
  endpoint overwrites).
- Sync clients limit per-process concurrency; scaling is by consumer count.

## Links

- [ADR-0020 embedding pipeline](ADR-0020-dedicated-embedding-pipeline.md)
- [Extractor spec](../components/extractor.md)
- [Relator spec](../components/relator.md)
- [Consolidator spec](../components/consolidator.md)
- [Event conventions](../conventions.md)
- [Auth and tenancy](../auth-and-tenancy.md)
