# 10 — Dependencies and lifecycle

This file answers two questions: which versions does VozLab run, and how far are they from supported releases?
Installed versions are from `node_modules` and `uv.lock` on 2026-10-23. "Latest" is from the npm registry (dist-tags)
on the same date, or from the vendor's page where noted. [run][web]

## 1. The headline

- **The runtime and framework choices are mainstream; several versions are not supported.** Fastify 4 has been out of
  LTS since 30 June 2025. The `redis` package is on its v4 maintenance line. Zod is on v3 while v4 is the current
  major. Node 22 is in maintenance and reaches end of life on 30 April 2027.
- **The security cost is real, not cosmetic.** Unsupported framework lines do not receive fixes unless the community
  supplies them. For an institutional platform, that is an audit finding waiting to happen.
- **Most upgrades are mechanical,** and the test suite (195 API tests, 515 web tests, 105 Python tests) is a good
  safety net. Plan them as waves, one component at a time, as `AGENTS.md` already requires.
- **There is dead weight to remove first:** a Cytoscape-based canvas that nothing imports, two Cytoscape packages still
  in `package.json`, and production imports listed as development dependencies.

## 2. Platform and runtime

| Component | In use | Latest or supported | Lifecycle (verified) | Action |
| --- | --- | --- | --- | --- |
| Node.js | CI and README: **22**. Developer machine used for this review: **v24.22.0**. | Node 24 is Active LTS until 30 April 2028. Node 26 becomes LTS in October 2026. Node 22 Maintenance LTS until 30 April 2027. Node 20 ended 30 April 2026. [web] | Node 22 is already in maintenance and has about six months of supported life left. | Move CI and `engines` to **Node 24** in Wave 0. Pin with `.nvmrc`. |
| PostgreSQL | **18.6** (`docker/postgres`; target) | Current minor **18.6**. PostgreSQL 18 supported until **14 November 2030**. PostgreSQL 14 ends **12 November 2026**. PostgreSQL 19 release candidate 1 was published 15 October 2026. [web] | Healthy. | Keep 18; plan the 19 evaluation after the first pilot. Track minor releases monthly. |
| pgvector | Taken from the PGDG apt repository, **not pinned** | Must be **0.8.0 or later** for iterative scans (F-04). [web] | Verify in every environment. | Pin the version in the image; test the iterative-scan setting. |
| Apache AGE | `release_PG18_1.8.0` base image | Not used by the code (ADR-0027). Not offered by Amazon RDS (issue #998). [web] | A dependency that buys nothing. | Remove from the default image (`05` §13). |
| Redis | `redis:7-alpine` locally. Production not defined. | Redis OSS 7.2 was the last BSD release; Redis 8 is available under AGPLv3, RSALv2 or SSPLv1. Valkey 9.1 is the BSD-3-licensed fork under the Linux Foundation. Amazon ElastiCache supports Valkey and sells it at a lower price per AWS. [web] | Licence choice matters for an institution. | Adopt **Valkey** for local and managed use (`11` §5). Streams are supported. Verify client compatibility in the integration suite. |
| Ollama | `ollama/ollama:latest` | Unpinned | Any upgrade can change model behaviour. | Pin the image tag; pin model digests (`06` §4). |
| Python | 3.12 (uv, `.python-version`) | Project target; 3.12 security support runs to 2028 [juicio] | Healthy. | No action now. |
| uv | 0.11.8 pinned in Dockerfiles and CI | Pinned | Healthy. | Keep pinned. |
| pnpm | `packageManager` 12.11.2 | 12.15.0 is the latest version on the registry [run] | Behind by a few releases. | Update in Wave 0. |

## 3. Node packages that matter

Declared ranges are from `package.json`. "Installed" is what `node_modules` resolved. "Latest" is the npm dist-tag
`latest` on 2026-10-23. Priority: **P1** security or support exposure; **P2** lag that will block a later upgrade;
**P3** hygiene.

| Package (where) | Declared | Installed | Latest | Status | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fastify` (api) | `^4.27.0` | **4.29.1** | **5.12.7** (6.0.0-alpha.5 on `next`) | v4 LTS ended 30 June 2025 [web] | **P1** | Migration guide: Node 20 minimum; full JSON Schema for query, params, body and responses; `getDefaultRoute` removed. Our Zod validation may limit the impact. Check plugin majors. |
| `redis` (api) | `^4.7.0` | **4.7.1** | **6.3.0** | Installed version is the `maintenance-v4` line [run] | **P1** | Rewrite the client calls; the Streams code path in the API (publisher, blacklist, rate limiter, OIDC state) needs integration tests against Valkey or Redis. |
| `zod` (api, shared-types, database) | `^3.23.0` | **3.25.76** | **4.6.7** | v3 is still shipped; v4 is the current major | **P2** | Shared-types is the choke point: one migration covers every consumer. Use `zod/v4` as a bridge if needed. |
| `jose` (api) | `^5.10.0` | **5.10.0** | **6.2.13** | Behind one major | **P2** | Used for ID token validation; test the OIDC fixtures carefully. |
| `jsonwebtoken` (api, database) | `^9.0.2` | 9.0.3 | 9.0.3 | Current, but a second JWT library | **P3** | Consolidate on `jose` (`09` S-18). |
| `pino` (api) | `^9.0.0` | **9.14.0** | **10.4.0** | Behind one major | **P3** | Redaction paths must still work. |
| `@fastify/cookie`, `@fastify/cors` (api) | `^9.4.0`, `^9.0.1` | not checked | not checked | Plugin majors must match Fastify 5 | **P2** | Check compatibility when Fastify moves. |
| `drizzle-orm`, `drizzle-kit` | `^0.45.4`, `^0.31.11` | 0.45.4, 0.31.11 | 0.45.4, 0.31.11 | Current | — | No action. |
| `pg` (api, database) | `^8.11.0` | — | 8.23.1 | Minor lag | P3 | Routine update. |
| `@sveltejs/kit` (web) | `^2.70.3` | **2.70.3** | **3.1.0** | A new major exists | **P2** | Plan after the pilot; read the migration guide. Adapter-node compatibility to verify. |
| `svelte` (web) | `^5.57.2` | 5.57.2 | 5.57.2 | Current | — | No action. |
| `vite` (web) | `^8.3.4` | 8.3.4 | 8.3.5 | Patch lag | P3 | Wave 0. |
| `vitest` (api, web) | api `^2.0.0`; web `^5.0.5` | — | 5.0.5 | **Two majors in one repository** | **P3** | Align on 5. |
| `tailwindcss`, `@tailwindcss/vite` | `^4.3.3` | — | 4.3.3 | Current | — | No action. |
| `typescript` (root and packages) | `^5.0.0` | — | **7.0.2** | A major exists | **P3** | Evaluate after the lint wave; check that `svelte-check`, Drizzle and Vitest support it. |
| `eslint` (root) | `^8.0.0` | — | **10.13.0** | ESLint 8 is past its end of life [juicio] | **P2** | This is why lint is red in part. Move to flat config. |
| `@typescript-eslint/*` (root) | `^6.0.0` | — | parser **8.72.0** | Two majors behind | **P2** | Wave 4 with ESLint. |
| `turbo` (root) | `2.11.9` | — | 2.11.10 | Patch lag | P3 | Wave 0. |
| `cytoscape`, `cytoscape-dagre` (web) | `^3.34.4`, `^4.0.1` | — | — | **Unused by the production app** | **P3** | Remove (section 4). |
| `d3-selection`, `d3-zoom`, `d3-drag` (web) | in **devDependencies** | — | — | **Imported by the production painter** [repo] | **P3** | Move to `dependencies` (a packaging error that does not break the build today). |
| `@playwright/test` (web) | `^1.64.1` | — | — | Current range | — | No action. |

Python packages (from `uv.lock`, verified): `httpx` 0.28.1, `pydantic` 2.14.1, `pydantic-settings` 2.16.0, `redis` (redis-py)
6.4.0, `PyJWT` 2.15.1, `pytest` 8.4.2, `fakeredis` 2.40.0, `ruff` 0.17.1. The lock is current for the ranges declared;
no vulnerability scan is run in CI (`09` S-12).

## 4. Dead code and dead dependencies

| Item | Evidence | Action |
| --- | --- | --- |
| `apps/web/src/lib/components/ExplorationCanvas.svelte` (Cytoscape canvas) | No file imports it. Its only dynamic import is `graph/explore/instance`, which is reachable only from this file. | Delete with its dependants. |
| `apps/web/src/lib/graph/explore/instance.ts`, `cytoscape-runtime.ts` | Imported only by the dead canvas. | Delete. |
| `cytoscape`, `cytoscape-dagre` packages | Listed as dependencies; the production app uses the SVG painter (ROADMAP 3.52). | Remove after the files above. |
| Cytoscape tests and fixtures (`tests/canvas-stylesheet.test.ts`, `tests/fixtures/StubCytoscapeCanvas.svelte`, `tests/harness/cytoscape.ts`) | Test the dead code. | Remove. |

**Why this matters beyond tidiness:** dead code is attack surface, costs build time and misleads the next reader. The
ROADMAP item 3.64 says the Cytoscape engine was removed. The last commit removed `GraphCanvas.svelte`, `graph/cytoscape.ts`
and their tests, but not this second set of files. The roadmap statement is therefore only partly true, which is a
small example of the documentation drift described in `14` §4.

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
