# 10 — Dependencies and lifecycle

> **Knowledge doc** — re-verified 2026-10-31 after `plans/upgrade-waves/v1`
> (waves 0–4 executed): Fastify 5, node-redis 6, Zod 4, jose 6, Valkey 9,
> ESLint 10, Node 24, pgvector ≥ 0.8.0, dead Cytoscape removed, Ollama
> pinned. Remaining lag: SvelteKit 2 (wave 5 deferred), TypeScript 5,
> Drizzle/Svelte/Tailwind/Python per §7. Upgrade waves graduate via
> `plans/upgrade-waves/`.

This file answers two questions: which versions does VozLab run, and how far are they from supported releases?
Installed versions are from `node_modules` and `uv.lock` on 2026-10-23. "Latest" is from the npm registry (dist-tags)
on the same date, or from the vendor's page where noted. [run][web]

## 1. The headline (updated 2026-11-02, post Waves 0-4)

- **Waves 0-4 are executed.** Fastify 5, node-redis 6, Zod 4, jose 6, Valkey 9, ESLint 10 (flat config), Node 24,
  pgvector >=0.8.0, dead Cytoscape removed, Ollama pinned to 0.5.4. The remaining lag is Wave 5 (SvelteKit 2 -> 3,
  deferred) plus minor version drift on Drizzle/Svelte/Tailwind/Python.
- **The runtime is healthy.** Node 24 is Active LTS until 30 April 2028; PostgreSQL 18 until 14 November 2030;
  Python 3.12 security support to 2028.
- **Most upgrades are mechanical,** and the test suite (≈352 API unit tests, ≈521 web tests, 105 Python tests) is a
  good safety net. Plan them as waves, one component at a time, as `AGENTS.md` already requires.
- **Dead weight removed.** The Cytoscape canvas, its packages and its tests are gone (Wave 0); d3 moved to
  `dependencies`. Remaining cleanup: AGE removal from the postgres image (`05` §13, still open).

## 2. Platform and runtime

| Component | In use | Latest or supported | Lifecycle (verified) | Action |
| --- | --- | --- | --- | --- |
| Node.js | **24** (CI, `.nvmrc`, `engines.node >=24`). Developer machine used for this review: v24.22.0. | Node 24 is Active LTS until 30 April 2028. Node 26 becomes LTS in October 2026. Node 22 Maintenance LTS until 30 April 2027 (ended support for 20 on 30 April 2026). [web] | Done in Wave 0: CI and engines moved to Node 24; `.nvmrc` pinned. | Keep 24; track minor releases monthly. (Updated 2026-11-02, post-Wave 0.) |
| PostgreSQL | **18.6** (`docker/postgres`; target) | Current minor **18.6**. PostgreSQL 18 supported until **14 November 2030**. PostgreSQL 14 ends **12 November 2026**. PostgreSQL 19 release candidate 1 was published 15 October 2026. [web] | Healthy. | Keep 18; plan the 19 evaluation after the first pilot. Track minor releases monthly. |
| pgvector | Taken from the PGDG apt repository, **not pinned** | Must be **0.8.0 or later** for iterative scans (F-04). [web] | Verify in every environment. | Pin the version in the image; test the iterative-scan setting. |
| Apache AGE | `release_PG18_1.8.0` base image | Still present in `vozlab/postgres:18-age-pgvector` (not removed). Not used by the code (ADR-0027). Not offered by Amazon RDS (issue #998). [web] | A dependency that buys nothing; pending removal. | Remove from the default image (`05` §13). (Still open 2026-11-02.) |
| Redis / Valkey | `valkey/valkey:9-alpine` locally (Wave 3). Production not defined. | Redis OSS 7.2 was the last BSD release; Redis 8 is available under AGPLv3, RSALv2 or SSPLv1. Valkey 9.1 is the BSD-3-licensed fork under the Linux Foundation. Amazon ElastiCache supports Valkey. [web] | Done in Wave 3: local compose switched to Valkey 9; client (`node-redis` 6) verified against it. | Keep Valkey; managed choice (RDS Proxy / PgBouncer) still open (`05` §7). (Updated 2026-11-02.) |
| Ollama | `ollama/ollama:0.5.4` | Pinned (Wave 3) | Digest pinning still recommended for models (`06` §4). | Keep pinned tag; add digest pin for models. (Updated 2026-11-02.) |
| Python | 3.12 (uv, `.python-version`) | Project target; 3.12 security support runs to 2028 [juicio] | Healthy. | No action now. |
| uv | 0.11.8 pinned in Dockerfiles and CI | Pinned | Healthy. | Keep pinned. |
| pnpm | `packageManager` 12.11.2 | 12.15.0 is the latest version on the registry [run] | Behind by a few releases. | Update in Wave 0. |

## 3. Node packages that matter

Declared ranges are from `package.json`. "Installed" is what `node_modules` resolved. "Latest" is the npm dist-tag
`latest` on 2026-10-23. Priority: **P1** security or support exposure; **P2** lag that will block a later upgrade;
**P3** hygiene.

| Package (where) | Declared | Installed | Latest | Status | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fastify` (api) | `^5.x` | **5.x** (Wave 1) | 5.12.7 (6.0.0-alpha.5 on `next`) | v4 LTS ended 30 June 2025 [web]; migrated in Wave 1. | **Done** | Migration complete (plugins aligned). Keep tracking 6.x. (Updated 2026-11-02.) |
| `redis` / `node-redis` (api) | `^6.x` | **6.x** (Wave 1) | 6.3.0 | Migrated in Wave 1; integration suite green against Valkey. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `zod` (api, shared-types, database) | `^4.x` | **4.x** (Wave 2) | 4.6.7 | Migrated in Wave 2 via shared-types choke point. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `jose` (api) | `^6.x` | **6.x** (Wave 2) | 6.2.13 | Migrated in Wave 2; OIDC fixtures green. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `jsonwebtoken` (api, database) | `^9.0.2` | 9.0.3 | 9.0.3 | Current, but a second JWT library | **P3** | Consolidate on `jose` (`09` S-18). |
| `pino` (api) | `^9.0.0` | **9.14.0** | **10.4.0** | Behind one major | **P3** | Redaction paths must still work. |
| `@fastify/cookie`, `@fastify/cors` (api) | `^9.4.0`, `^9.0.1` | not checked | not checked | Plugin majors must match Fastify 5 | **P2** | Check compatibility when Fastify moves. |
| `drizzle-orm`, `drizzle-kit` | `^0.45.4`, `^0.31.11` | 0.45.4, 0.31.11 | 0.45.4, 0.31.11 | Current | — | No action. |
| `pg` (api, database) | `^8.11.0` | — | 8.23.1 | Minor lag | P3 | Routine update. |
| `@sveltejs/kit` (web) | `^2.70.3` | **2.70.3** | **3.1.0** | A new major exists | **P2** | Plan after the pilot; read the migration guide. Adapter-node compatibility to verify. |
| `svelte` (web) | `^5.57.2` | 5.57.2 | 5.57.2 | Current | — | No action. |
| `vite` (web) | `^8.3.4` | 8.3.4 | 8.3.5 | Patch lag | P3 | Wave 0. |
| `vitest` (api, web) | `^5.x` both | **5.x** (Wave 0) | 5.0.5 | Aligned on 5 in Wave 0. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `tailwindcss`, `@tailwindcss/vite` | `^4.3.3` | — | 4.3.3 | Current | — | No action. |
| `typescript` (root and packages) | `^5.0.0` | — | **7.0.2** | A major exists | **P3** | Evaluate after the lint wave; check that `svelte-check`, Drizzle and Vitest support it. |
| `eslint` (root) | `^10.x` | **10.x** (Wave 4, flat config) | 10.13.0 | Migrated in Wave 4 to flat config. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `@typescript-eslint/*` (root) | `^6.0.0` | — | parser **8.72.0** | Two majors behind | **P2** | Wave 4 with ESLint. |
| `turbo` (root) | `2.11.10` | **2.11.10** (Wave 0) | 2.11.10 | Patched in Wave 0. | **Done** | Keep tracking minors. (Updated 2026-11-02.) |
| `cytoscape`, `cytoscape-dagre` (web) | *removed* | **removed** (Wave 0) | — | Unused production app; deleted with dead canvas files. | **Done** | No longer in package.json (verified 2026-11-02). |
| `d3-selection`, `d3-zoom`, `d3-drag`, `d3-force` (web) | in **dependencies** | **dependencies** (Wave 0) | — | Moved to dependencies in Wave 0; verified in package.json (2026-11-02). | **Done** | — |
| `@playwright/test` (web) | `^1.64.1` | — | — | Current range | — | No action. |

Python packages (from `uv.lock`, verified): `httpx` 0.28.1, `pydantic` 2.14.1, `pydantic-settings` 2.16.0, `redis` (redis-py)
6.4.0, `PyJWT` 2.15.1, `pytest` 8.4.2, `fakeredis` 2.40.0, `ruff` 0.17.1. The lock is current for the ranges declared;
no vulnerability scan is run in CI (`09` S-12).

## 4. Dead code and dead dependencies

**Status (2026-11-02): the Cytoscape cleanup is complete.** Verified by grep: no `cytoscape` references remain in
`apps/web/src` or `apps/web/package.json` (only historical mentions in archive/ and research docs).

| Item | Status | Notes |
| --- | --- | --- |
| `ExplorationCanvas.svelte` + `graph/explore/instance.ts` + `cytoscape-runtime.ts` | **Removed** (Wave 0) | Dead canvas and its dependants deleted. |
| `cytoscape`, `cytoscape-dagre` packages | **Removed** (Wave 0) | No longer in `apps/web/package.json`. |
| Cytoscape tests and fixtures | **Removed** (Wave 0) | — |

**Why this matters beyond tidiness:** dead code is attack surface, costs build time and misleads the next reader. The
ROADMAP item 3.64 ("Cytoscape engine removed") is now fully true. Remaining drift: `docs/components/web-pwa.md` and
`ROADMAP.md` still describe the canvas as "Cytoscape.js" in prose — tracked as task T3 of this feature.

## 5. Upgrade plan, in waves

Each wave is one branch, one component at a time, with the full test suite, a rollback path and a line in the
roadmap. Estimates are for one experienced engineer and are judgments.

| Wave | Scope | Effort | Exit criteria |
| --- | --- | --- | --- |
| **0. Hygiene** (days) | Remove dead Cytoscape code and packages; move d3 packages to `dependencies`; patch updates (turbo, pnpm, vite, pg); align vitest on 5; pin Node 24 in CI and `.nvmrc`; pin Ollama and image digests; add `permissions:` to CI; Dependabot or Renovate. | 2–3 days | Build, type-check and tests green; bundle size not larger; CI runs on Node 24. |
| **1. Fastify and Redis client** | Fastify 4 → 5 with its plugins; node-redis 4 → 6 (publisher, blacklist, rate limiter, OIDC state, Streams); pino 9 → 10. | 1–2 weeks | All API tests and the integration suite green against Valkey or Redis; rate-limit and blacklist behaviour tested; health probes unchanged. |
| **2. Validation and tokens** | Zod 3 → 4 in shared-types and consumers; jose 5 → 6; remove `jsonwebtoken` (S-18). | 1 week | Contract tests on every DTO; OIDC fixtures green; no change in error envelopes. |
| **3. Stateful dependencies** | PostgreSQL 18 minor updates; pgvector pinned to 0.8+; AGE removed from the default image (`05` §13); Valkey in compose. | 2–3 days plus testing | Migrations applied to a fresh database; integration tests green; vector recall test (`05` §4) passing. |
| **4. Tooling** | ESLint 8 → 10 (flat config), typescript-eslint 8; fix or justify the `no-explicit-any` debt (roadmap 4.7); evaluate TypeScript 7. | 1–2 weeks | `pnpm lint` green and gated in CI. |
| **5. Frontend framework** | SvelteKit 2 → 3 after its migration guide is read and the adapter is confirmed. | 1–2 weeks | Playwright E2E green; SSR language and panel cookies still correct. |

**Sequencing rules (judgment):**

- Do not start a major upgrade in the two weeks before a demonstration. Patch updates are fine.
- Wave 1 is the priority because it touches the security surface and the Redis behaviour the platform depends on.
- Each wave must leave the repository in a buildable state. The `AGENTS.md` rule is correct.
- Record each major upgrade as a short ADR when it changes a public contract or a security property.

## 6. Policies to keep the lifecycle healthy

| Policy | Mechanism | Owner |
| --- | --- | --- |
| Security patches within 14 days | Dependabot or Renovate with auto-merge for patch and security updates, gated by CI | Engineer on duty |
| Monthly minor and patch wave | Scheduled branch and checklist | Engineer |
| Runtime and database end-of-life calendar | A table in this file, reviewed monthly | Product owner |
| No unsupported major in production | Check in CI: fail on a declared major that the registry marks as unsupported (or a manual gate until automated) | Engineer |
| Lockfile is the contract | `pnpm install --frozen-lockfile` and `uv sync --frozen` in CI (already present) | — |
| Image digests pinned | Build step records digests in a manifest | Engineer |
| SBOM and vulnerability scan before deploy | Generated in the image job (`09` S-12) | Engineer |

## 7. What not to upgrade without a reason

- **Drizzle** is current and aligned with the schema workflow. Leave it.
- **Svelte 5** is current. Leave it until SvelteKit 3 forces the question.
- **Tailwind 4** is current. Leave it.
- **Python 3.12** is correct for the project's needs. Move to a later Python when a dependency requires it.

## 8. Verification notes

- Installed versions were read from `node_modules` by requiring each `package.json`.
- Latest versions were read with `npm view <package> dist-tags` and `version` on 2026-10-23.
- Lifecycle dates for Fastify come from the Fastify LTS page and secondary summaries; the PostgreSQL dates come from
  the PostgreSQL versioning page; Node dates come from endoflife.date and the Node.js release notes.
- No vulnerability database query was run (no `pnpm audit` was executed in this review). Run it before acting on
  any security claim in this file.
