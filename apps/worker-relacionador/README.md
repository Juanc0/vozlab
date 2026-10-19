# VozLab Relator Worker

Agent 2 of the AI pipeline. It consumes `stream:node_created` with its own
consumer group (`relator`), reads the closest nodes of the workspace, asks a
local LLM for a verdict and proposes a `PENDING` edge. It never writes to
tenant PostgreSQL.

**Status: implemented (milestone 2.5), with two documented deviations.**

- The neighbour lookup runs inside the API
  ([ADR-0022](../../docs/decisions/ADR-0022-relator-neighbour-lookup.md)):
  `GET /api/v1/nodes/:id/neighbors` returns the top-5 workspace-scoped
  candidates, or `409 ERR_NODE_NOT_EMBEDDED` while the embedder has not
  written the vector yet.
- An `EDGE` verdict creates a `PENDING` edge through `POST /api/v1/edges`
  with a relation key taken from the workspace ontology. A `MERGE` verdict is
  **logged, not applied** — there is no merge contract yet
  ([ADR-0023](../../docs/decisions/ADR-0023-relator-edge-and-merge-semantics.md)).

```bash
# from the repository root, with uv installed
uv sync
uv run vozlab-worker-relacionador --check   # validate config and credentials
uv run vozlab-worker-relacionador           # run until SIGTERM/SIGINT
uv run vozlab-worker-relacionador --once    # single pass, then exit
```

Required environment (see [ADR-0021](../../docs/decisions/ADR-0021-python-worker-runtime.md)):

```dotenv
AGENT_TOKEN=...                 # or AGENT_TOKEN_FILE
API_BASE_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379/0
WORKSPACE_ID=33333333-3333-4333-8333-333333333333
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.1:8b
NEIGHBORS_LIMIT=5
```

## Behaviour

| Situation | Outcome |
| --- | --- |
| The node has no vector yet (`409`) | Retryable — the entry stays pending and is recovered with `XAUTOCLAIM` |
| No neighbours | No action; the entry is acknowledged |
| The model answers `INDEPENDENT` | No action; the verdict is logged |
| The model answers `MERGE` | Logged only — no merge contract exists |
| The model answers `EDGE` but the ontology has no matching relation | No action; the reason is logged |
| An edge between the two nodes already exists | No action (best-effort duplicate guard) |
| The model answers an unknown action or a hallucinated target | Retryable model failure — the entry stays pending |
| The node was deleted (`404`) | Permanent — dead-lettered |

After `STREAM_MAX_ATTEMPTS` deliveries a message is copied to
`stream:node_created:dead` (original payload, error, attempt count) and
acknowledged.
