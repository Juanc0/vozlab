# ADR-0047: Dependency upgrade wave (Fastify 5, node-redis 6, Valkey, Zod 4, jose)

- Status: Accepted
- Date: 2026-10-31
- Related: [docs/archive/plans/upgrade-waves/v1.md](../archive/plans/upgrade-waves/v1.md),
  [docs/knowledge/dependency-lifecycle.md](../knowledge/dependency-lifecycle.md),
  ADR-0001 (bearer JWT), ADR-0018 (OIDC sessions), ADR-0027 (AGE deferred),
  ADR-0037 (Ollama colocated).

## Context

VozLab ran on unsupported lines (Fastify 4 LTS ended 2025-06-30, node-redis 4
maintenance line, ESLint 8 EOL, Zod 3 while v4 is current) and unpinned
images (Ollama `:latest`). The `docs/knowledge/dependency-lifecycle.md` review
(2026-10-29) defined six waves. This ADR records the decisions taken while
executing waves 0–4 (wave 5 deferred) under `plans/upgrade-waves/v1.md`.

## Decision

1. **Fastify 4 → 5** (with `@fastify/cookie` 11 and `@fastify/cors` 10). The
   constructor's deprecated `requestIdLogLabel` top-level option is replaced
   by `new LogController({ requestIdLogLabel })`. No `getDefaultRoute` usage or
   route schemas existed, so the migration is mechanical. Health probes and
   proxy trust are unchanged.
2. **node-redis 4 → 6**. Client call sites (publisher, blacklist, rate
   limiter, OIDC state store) are unchanged in shape; `del` is invoked with an
   array (the v6 type accepts `RedisCommandArgument | Array<...>`). Verified
   against Redis 7 and Valkey 9 (integration suite, 50 tests).
3. **Valkey 9 replaces Redis OSS 7** in `docker-compose.yml` and
   `docker-compose.prod.yml`. Licence decision: Valkey (BSD-3, Linux
   Foundation) over Redis 8 (AGPLv3/RSALv2/SSPLv1). Streams, consumer
   groups, `XAUTOCLAIM` and the blacklist work unchanged; the node-redis 6
   client is compatible.
4. **Zod 3 → 4** in `packages/shared-types` (choke point) and `apps/api`.
   `z.record(...)` calls gained an explicit key schema
   (`z.record(z.string(), z.unknown())`). Error envelopes are unchanged.
5. **jose 5 → 6**; production JWT minting (`JwtTokenIssuer`) and validation
   (`AuthGuard`) now use jose (`SignJWT`/`jwtVerify`). `issue()` becomes
   async. `jsonwebtoken` moves from a production dependency to a devDependency
   (test token minting and the `db:mint-token` CLI still use it; production
   no longer does). `@types/jsonwebtoken` stays in devDeps.
6. **ESLint 8 → 10** with a flat `eslint.config.js`; `typescript-eslint` 8;
   `@eslint/js` 10. `no-undef` is off for TS files (TypeScript owns that),
   `preserve-caught-error` and `no-useless-assignment` are off (new noisy
   rules). Lint is 0 errors / ~39 warnings and remains a CI gate.
7. **Node 24** pinned via `.nvmrc`, `engines.node`, and CI `setup-node`.
8. **TypeScript 7** and **SvelteKit 3** are evaluated but **deferred**: TS 7
   needs `svelte-check`/Drizzle/Vitest confirmation; SvelteKit 3.1.1 requires
   TypeScript ^6.0.0 (only beta/dev releases exist as of 2026-10-31) and
   adapter-node 6.x. Both are tracked for `plans/upgrade-waves/v2`.
9. **Left untouched** per `dependency-lifecycle.md` §7: Drizzle 0.45, Svelte
   5, Tailwind 4, Python 3.12. Dead Cytoscape code and packages removed; d3
   packages moved to `dependencies`; Ollama image pinned to 0.5.4 with a model
   manifest; pgvector pinned ≥ 0.8.0; Apache AGE removed from the default
   image and init script.

## Consequences

- All waves 0–4 leave `pnpm turbo run build type-check test` green (9 tasks)
  and the integration suite green (50 tests) against PG 18 + Valkey 9.
- Wave 5 (SvelteKit 3) is deferred; tracked in ROADMAP "Tracked, not
  scheduled" and `plans/upgrade-waves/v2`.
- The dev container is now Valkey instead of Redis; operators must re-pull
  `valkey/valkey:9-alpine` on first run.