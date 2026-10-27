# ADR-0037: Ollama stays colocated with the workers; a dedicated GPU node in production

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0036 (workers always-on), ADR-0020 (embedding pipeline)

## Context

Embeddings (`nomic-embed-text`, 768 dims) and LLM verdicts (relator) are
latency-sensitive and model-warmth-dependent. A remote Ollama adds a network
round-trip per node and risks cold starts; a public Ollama is a security risk.

## Decision

1. **In the demo, Ollama runs on the same host as the workers** (compose
   service `ollama`, profile default). `OLLAMA_KEEP_ALIVE` keeps the model
   loaded; a pre-warm step runs one embedding before presenting.
2. **In production, Ollama runs on a dedicated GPU instance** (EC2 g4dn/g5 or an
   on-prem box) in a private subnet, reachable only from the worker subnet.
3. **Ollama is never exposed publicly** and never runs in Lambda or any
   serverless runtime.
4. **The API and workers address Ollama via `OLLAMA_BASE_URL`** (env var), so
   the location is configuration, not code.

## Consequences

### Positive

- Sub-millisecond to low-millisecond embedding round-trips in the demo.
- Warm model; no cold starts on the LLM path.
- Location is configurable without code changes.

### Negative / costs

- A GPU instance is required in production (cost).
- Single point of failure for AI features if the GPU node is down.

## Links

- `apps/worker-embedder/src/worker_embedder/ollama.py`
- `apps/worker-relacionador/src/worker_relacionador/ollama.py`
- `docker-compose.yml` (`ollama` service)
- `AGENTS.md` (Ollama in main compose)
