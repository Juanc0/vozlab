# VozLab Embedder Worker

Dedicated consumer for `stream:node_created` (ADR-0020). It computes the
768-dimensional `nomic-embed-text` vector and writes it through the agent-only
API endpoint; it never writes tenant PostgreSQL.

**Status: scaffold (milestone 2.1).** The Python package, configuration and
shared runtime are wired. The Ollama handler and API write-back land in
milestone 2.4.

```bash
# from the repository root, with uv installed
uv sync
uv run vozlab-worker-embedder --check
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
token exactly like `db:mint-token`. The future write endpoint requires
`type=AGENT_EMBEDDER`; `db:mint-token --as agent` still emits
`AGENT_EXTRACTOR`, so use the dev-minting path with `AGENT_TYPE=AGENT_EMBEDDER`
for milestone 2.4.

`--check` validates configuration only. There is no `--consume` mode yet; a
running process without `--check` exits `2`.
