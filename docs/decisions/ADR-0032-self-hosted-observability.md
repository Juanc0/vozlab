# ADR-0032: Self-hosted observability (Prometheus, Tempo, Grafana)

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0017 (thin CI), ADR-0021 (worker runtime)

## Context

The API and workers had no runtime observability beyond structured logs. Debugging
latency and failures required reading logs manually. We need metrics, distributed
traces and dashboards without external SaaS cost.

## Decision

1. **Metrics.** The API exposes `GET /metrics` (Prometheus text format) via
   `prom-client` with default Node metrics plus `vozlab_http_request_duration_seconds`
   and `vozlab_http_requests_total`. Workers expose `/metrics` via
   `prometheus-client` in `packages/worker-shared` on a configurable port
   (`METRICS_PORT`, default 9100).
2. **Tracing.** The API uses OpenTelemetry (`@opentelemetry/sdk-node` with
   auto-instrumentations for Fastify, pg, ioredis, http) exporting OTLP to
   Tempo. `trace_id`/`span_id` are injected into every log line via a pino mixin.
3. **Backend.** Self-hosted Prometheus + Grafana + Tempo under
   `docker compose --profile observability`. No external SaaS, no cost.
4. **Dashboards.** Grafana provisioning (datasources + dashboard JSON) committed
   under `docker/grafana/`. A starter "VozLab API Overview" dashboard ships.
5. **Sampling.** Head sampling at 100% in dev; production sampling is left to
   configuration (OTEL_TRACES_SAMPLER).

## Consequences

### Positive

- Full observability stack runs locally with one command.
- Zero external cost; data stays on the machine.
- Metrics, traces and logs are correlated via `trace_id`.

### Negative / costs

- Tempo and Grafana add ~400MB RAM to the dev stack.
- Dashboards are JSON (verbose, fragile); must be maintained.
- Workers require `METRICS_PORT` exposure in Docker for scraping.

## Links

- `apps/api/src/infrastructure/http/metrics.ts`
- `apps/api/src/infrastructure/observability/tracing.ts`
- `packages/worker-shared/src/vozlab_worker/metrics.py`
- `docker-compose.yml` (`--profile observability`)
- `docker/prometheus/prometheus.yml`, `docker/tempo/tempo.yaml`
- `docker/grafana/provisioning/`, `docker/grafana/dashboards/`
