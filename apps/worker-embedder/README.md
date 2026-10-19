# VozLab Embedder Worker

Dedicated consumer for `stream:node_created` (ADR-0020). It reads the node
through the API, asks the local Ollama model for the 768-dimensional
`nomic-embed-text` vector and writes it back through the agent-only
`PUT /api/v1/nodes/:id/embedding`; it never writes tenant PostgreSQL.

**Status: implemented (milestone 2.4).** Not in Compose/CI yet (milestone
2.7), and there is no backfill for nodes created before the worker ran.

```bash
# from the repository root, with uv installed
uv sync
uv run vozlab-worker-embedder --check    # validate config and credentials
uv run vozlab-worker-embedder            # run until SIGTERM/SIGINT
uv run vozlab-worker-embedder --once     # single pass, then exit
```

Required environment (see [ADR-0021](../../docs/decisions/ADR-0021-python-worker-runtime.md)):

```dotenv
AGENT_TOKEN=...                 # or AGENT_TOKEN_FILE
API_BASE_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379/0
WORKSPACE_ID=33333333-3333-4333-8333-333333333333
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

For local development `JWT_SECRET` plus `AGENT_TENANT_KEY`, `AGENT_USER_ID` and
`AGENT_AUTHOR_HASH` can replace `AGENT_TOKEN`; the runtime mints and refreshes a
token exactly like `db:mint-token`. The write endpoint requires
`type=AGENT_EMBEDDER`; `pnpm --filter @vozlab/database db:mint-token -- --as
embedder` mints one.

## Behaviour

| Failure | Outcome |
| --- | --- |
| Ollama unreachable, timeout, 5xx, malformed vector | Retryable — the entry stays pending and is recovered with `XAUTOCLAIM` |
| Ollama rejects the request (4xx, e.g. model not pulled) | Permanent — dead-lettered immediately |
| API `404` (node deleted/foreign) | Permanent — dead-lettered |
| API `422` (bad vector/model) | Permanent — dead-lettered |
| API `401`/`403` (wrong credentials or agent type) | Permanent — dead-lettered |
| API `429`/`5xx` | Retryable — the client retries the idempotent `PUT` with backoff |

After `STREAM_MAX_ATTEMPTS` deliveries a message is copied to
`stream:node_created:dead` (original payload, error, attempt count) and
acknowledged.
