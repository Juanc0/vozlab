# ADR-0033: Demo topology is a single host with a tunnel; no cloud for the MVP

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0004 (AGE deferred), ADR-0027 (ranked traversal), ADR-0032 (observability), ADR-0040 (zrok demo exposure)

## Context

The stack depends on Apache AGE and pgvector (ADR-0004, ADR-0027), which are
absent from every managed PostgreSQL allow-list. A cloud migration would
therefore require self-hosting Postgres on EC2 anyway, defeating the purpose of
"managed" infrastructure and adding cost and latency for no benefit at demo scale.
Ollama also needs a persistent process with a warm model and (ideally) a GPU.

## Decision

1. **The MVP/demo runs on a single host** with the existing `docker compose`
   topology (`--profile workers`, optionally `--profile idp` and
   `--profile observability`). No cloud provider is involved.
2. **Public access is provided by a tunnel** (Cloudflare Tunnel or ngrok) in
   front of the web (port 5173) and the API. No inbound ports are opened on the
   host. TLS is terminated by the tunnel.
3. **Ollama is pre-warmed** before the demo (`OLLAMA_KEEP_ALIVE`) and the
   Postgres volume is snapshotted so a bad run can be reset in seconds.
4. **Cloud (AWS/GCP/Azure) is deferred to Phase 5**, gated on a university
   committing to host its own data and accepting the self-hosted Postgres
   constraint.

## Consequences

### Positive

- Zero cloud cost; data stays on the demo machine.
- Sub-millisecond embedding round-trips (Ollama colocated).
- The existing compose topology is the deployment artifact.

### Negative / costs

- Single point of failure; no HA.
- The demo host must stay online and awake.
- No autoscaling; capacity is fixed by the host.

## Links

- `docker-compose.yml`
- `AGENTS.md` (dev servers are host processes)
- `docs/components/consolidator.md` (not built)
