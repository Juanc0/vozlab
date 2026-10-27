# ADR-0034: Keep Redis Streams as the worker queue; add trimming and an outbox instead of migrating to SQS

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0021 (Python worker runtime), ADR-0020 (embedding pipeline)

## Context

The workers (embedder, relator, extractor) consume `NODE_CREATED` and
`stream:source_raw` through Redis Streams with consumer groups, `XAUTOCLAIM`
recovery, bounded retries and dead-letter streams. A migration to SQS would
require rewriting `packages/worker-shared`, the publisher and every worker, while
Redis is already required for rate limiting, the token blacklist and OIDC state.

## Decision

1. **Redis Streams remain the transport.** No migration to SQS, Kafka or any
   managed queue for the MVP or Phase 5 unless a multi-region or sub-minute RPO
   requirement appears.
2. **Trimming.** `RedisEventPublisher` gains `MAXLEN ~` so streams cannot grow
   unbounded. A retention policy is documented.
3. **Outbox (Phase 5).** Post-commit best-effort publication is replaced by an
   outbox table + relay when RPO < 1 minute is required.
4. **Replay.** A CLI re-XADDs from a persisted snapshot for backfill/recovery.

## Consequences

### Positive

- One dependency instead of two; no rewrite of the worker runtime.
- Co-located with rate limiting, blacklist and OIDC state.
- No per-message cost.

### Negative / costs

- No managed durability; Redis outage drops events (mitigated by outbox in Phase 5).
- Streams are unbounded without trimming (fixed by `MAXLEN ~`).
- No managed backpressure beyond a single Redis node.

## Links

- `apps/api/src/infrastructure/events/RedisEventPublisher.ts`
- `packages/worker-shared/src/vozlab_worker/streams.py`
- `docs/decisions/ADR-0021-python-worker-runtime.md`
