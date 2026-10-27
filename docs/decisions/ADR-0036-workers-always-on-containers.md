# ADR-0036: Workers are always-on containers; Lambda is used only for stateless glue

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0021 (Python worker runtime), ADR-0020 (embedding pipeline)

## Context

The embedder, relator and extractor consume Redis Streams with blocking reads
(`XREADGROUP`), call Ollama (a persistent process with a warm model, ideally on
a GPU) and need deterministic latency. Lambda has no GPU, a 15-minute timeout
and cold starts; a blocking consumer loop is an anti-pattern there.

## Decision

1. **Embedder, relator and extractor run as always-on containers** (ECS Fargate
   or EKS in production; the `workers` compose profile locally). They scale by
   stream lag, not by request count.
2. **Ollama is colocated with the workers** on the same host/GPU node for the
   demo; in production it runs on a dedicated GPU instance (EC2 g4dn/g5 or an
   on-prem box) behind a private endpoint. It is never exposed publicly and
   never runs in Lambda.
3. **Lambda is reserved for stateless glue**: webhook receivers that enqueue to
   `stream:source_raw`, scheduled triggers for the Consolidator, and one-off
   backfill jobs.

## Consequences

### Positive

- Predictable latency; warm model; no cold starts on the LLM path.
- The existing Dockerfiles and CI image builds already implement this.
- Scaling is driven by measurable stream lag.

### Negative / costs

- A persistent host/container is required even at low traffic.
- No scale-to-zero; baseline cost is non-zero.

## Links

- `apps/worker-embedder/Dockerfile`, `apps/worker-relacionador/Dockerfile`,
  `apps/worker-extractor/Dockerfile`
- `docker-compose.yml` (`--profile workers`)
- `.github/workflows/ci.yml` (image builds)
