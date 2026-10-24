# 02 — Background and the decisions that led here

This file explains how VozLab reached its current shape, which choices were made and why, which were
rejected, and what the history teaches. It is written so that someone who joins next month understands the
reasons, not only the outcome.

## 1. The product in one paragraph

VozLab turns scattered listening inputs (surveys, suggestion boxes, meeting minutes) into typed graph
nodes, lets the community debate them in threads, and changes content through a pull-request-style flow in
which only the maintainer of an object can approve a change. Each institution is a **tenant** with its own
database; each project or faculty inside it is a **workspace**. Three AI agents and one embedding worker
are meant to help the graph grow and stay coherent. [repo] `README.md`, `docs/requirements.md`

## 2. Timeline, reconstructed from the repository

The repository has **151 commits** from **2026-10-09** to **2026-10-23**, all by one author, all on `main`.
The table condenses the history into the phases that changed the direction of the work. [repo] `git log`

| Date | What happened | Why it matters now |
| --- | --- | --- |
| 10-09 | Design documents committed; Apache AGE first added to the schema plans. | AGE was in the plan from day one. It was later deferred (ADR-0004, ADR-0027). |
| 10-11 | Documents scaffolded and re-scaffolded; commits named after a CrewAI script and a Gemini review ("Fix incoherences found by gemini pro"). | The first document set was produced and reviewed with AI tools. That explains the speed and some of the drift (section 6). |
| 10-12 | Milestone "Hito-0.1", Claude Code environment, first `TODO.md`. | Work starts in an agent-driven workflow. |
| 10-16 | Structured tasks TASK-02 to TASK-16: correlation IDs, readiness probes, membership enforcement, typed domain errors, rate limiter, proposal authorisation, vertical slices for nodes, edges, ontology, discussions and votes. | The API core is built as vertical slices with explicit tasks and reviews. |
| 10-17 | Reviews of phases 1R and 1S; shared contracts aligned; the dev seed provisions a tenant. | Reviews are written down and archived. This is a strength to keep. |
| 10-18 / 10-19 | Tasks 18 to 37: dev identities, pseudonym hardening, the system-agent contract, cross-workspace isolation, soft-delete policy, per-actor rate limits, vote semantics, the AGE decision (TASK-29), the salt model (TASK-37, later cancelled). Batch 1V delivers real OIDC login, JIT accounts and rotating sessions. ADR-0014 to ADR-0026 written. Phase 2 starts: the Python worker runtime and the embedder. | The security and identity model was re-decided twice in two days. ADR-0013 is the outcome of that churn. |
| 10-20 | **The presentation round** (3.8 to 3.14): a Spanish demo graph, a development sign-in, the interface in Spanish and English, the exploration view, the inspector and the mobile layout. | A deadline-driven detour. It created the demo that is persuasive today, and it introduced the "seeded ACTIVE" shortcut that hides F-01. |
| 10-21 | **The design round** (3.15 to 3.23) and the graph-engine research. ADR-0027 defers AGE with a measurable trigger. The product owner corrects an assumption: the product is **online-first**, not offline-first. | A correction of premise that the team documented as a rule. |
| 10-22 | Forty-plus items on the spring layout, edge routing, painters and comparisons (3.24 to 3.60). The comparison surface was built, measured and removed. | The graph canvas consumed most of the effort of the week. See section 7. |
| 10-23 | Snapshot: Phase 3 closed; Phase 4 (platform and operations) at 0 of 7. | The next work is not on the board's visible path. |

Totals on the board at this snapshot: **82 items done, 8 open**. Phase 3 is complete (58 items). Phase 4,
which holds integration tests, load tests, observability, images, the deployment pipeline and lint debt,
has **0 of 7** items done. [repo] `ROADMAP.md`

## 3. The decisions that shaped the system

The ADR set is the best map of why the system looks the way it does. The rows below are the decisions that
still constrain future work. Status is as of this snapshot.

| ADR | Decision | Why (in one line) | Constraint it creates |
| --- | --- | --- | --- |
| 0002 | Two physical PostgreSQL databases: a router and one database per tenant. | Data sovereignty: an institution's graph must not share a database with another's. | Every tenant needs its own migrations, pool and backup. Fleet tooling is required (F-11). |
| 0004 | Subgraph reads are a bounded recursive SQL CTE; Apache AGE deferred. | One source of truth, no dual write, index-covered reads. | No Cypher; graph analytics must be expressed in SQL or computed elsewhere. |
| 0005 | Votes update counters synchronously in the same transaction. | Strong consistency, no buffer to lose data. | Hot targets serialise on a row. Acceptable at pilot scale. |
| 0009 / 0025 | An API-owned registry maps a source key to a workspace. | Ingestion must not trust a workspace id from the worker. | The source registry has no management route yet. |
| 0013 | Pseudonyms are random and stored per user, not derived from identity with a salt. | Removes a secret to manage and makes rotation a data change, not a configuration change. | Pseudonymity protects the graph, not the database (see `05` §10). |
| 0016 | GraphQL rejected. | One guard chain and one authorisation model, applied before any handler. | Clients get fixed shapes; new read shapes need endpoints. |
| 0018 | OIDC authorisation code with PKCE; the API is a resource server with its own short-lived HS256 access token and an opaque rotating refresh token in an HttpOnly cookie. | The API never accepts an IdP token as a graph credential. | HS256 shares one secret with every worker (see `09`, S-06). |
| 0019 | A global event-code registry in the router, the only exception to the router/tenant split. | A QR is scanned before the tenant is known. | The router now holds tenant-scoped metadata. Any further global table needs its own ADR. |
| 0020 | A dedicated embedder consumes `NODE_CREATED` and writes the vector through an agent-only API route. | Mutations must not wait on a model; workers must not write SQL. | Two processes and one extra route. Good trade. |
| 0021 | Python 3.12 workers with uv, a shared runtime, and Redis Streams consumer groups. | Redis Streams provide the pending-entry recovery semantics needed. | Two languages in the repository; the shared runtime must be kept in step. |
| 0023 / 0026 | The Relator proposes edges (`PENDING`) and merges as proposals; it never applies a merge itself. | Humans stay in the loop for structural change. | Only holds if the approval path works, which F-01 says it does not for agent output. |
| 0027 | Ranked neighbour traversal (strongest relation first), two new indexes, AGE deferred with a measurable trigger. | "Nearest" needed a definition; AGE is a query language, not a concurrency fix. | The trigger (1M nodes, 3M relations, p95 above 300 ms) is a sound test to keep. |

## 4. Rejected or deferred alternatives, and their reasons

| Alternative | Where it was considered | Reason it was not taken |
| --- | --- | --- |
| Apache AGE as the traversal engine | ADR-0004, ADR-0027, TASK-29 | No evidence that Cypher beats the CTE for this shape; Amazon RDS does not offer AGE (community issue #998, not yet resolved); concurrency is not solved by a query language. |
| Redis-buffered CQRS for votes | ADR-0005 | Would need a flush and reconciliation design; the synchronous increment is correct and simple. |
| Salt-derived pseudonyms with per-tenant rotation | ADR-0013 (superseded design) | A secret to store, rotate and leak, and a costly rotation. |
| Refresh token as a second JWT | ADR-0018 | Revocation still needs server state; a signed refresh token adds nothing. |
| Refresh token in JSON storage | ADR-0018 | Exposes a 30-day credential to XSS. |
| Server-side session id in a cookie | ADR-0018 | Would turn the API from a resource server into a session server. |
| Tenant slug inside the QR code | ADR-0019 | Leaks the institution through a public artefact. |
| Relator computes its own embedding | ADR-0020 | Couples relationship latency to model latency; leaves no vector when the Relator skips a node. |
| API computes embeddings on write | ADR-0020 | Makes Ollama part of the write path. |
| Celery or RQ for workers | ADR-0021 | A broker abstraction over a system that already has the needed Stream semantics. |
| Async Python throughout | ADR-0021 | Synchronous code is simpler for ordered stream handling; to revisit with evidence. |
| Batch node endpoint | ADR-0024 | The rate limiter counts requests, so a bulk route would bypass the write budget. |
| GraphQL facade | ADR-0016 | Deferred until query flexibility is a measured bottleneck. |
| Server-sent events | ADR-0015 | Not needed for the current interaction model; deferred. |
| Sigma.js, cytoscape-fcose, dagre and d3-dag layouts | ROADMAP 3.17, 3.24, 3.36, 3.32 | Compared on the same data and removed once the SVG painter won on the criteria the product needs. |
| Offline-first with local state | ROADMAP (research of 10-21, corrected) | The product owner corrected the premise: data is shown and edited online; the shell is cached only for a fast open. |

Two rejections deserve a second look later, because the context may change: **GraphQL** if many clients
need different shapes, and **SSE** once the community expects live updates in the graph.

## 5. Pivots and corrections, and what they say about the team

The history shows a team that **corrects its premises in writing**. Three corrections are worth keeping:

1. The graph research of 10-21 argued for bundle size on offline grounds. The product owner's correction
   made the product online-first, and the roadmap now forbids that argument.
2. The AGE question was reopened by a review, which found that the extension was installed and empty, not in
   use. The decision became a measurable trigger.
3. ADR-0013 replaced a salt design after analysis showed that the salt did not protect against anyone who
   could already read the mapping table, which lives in the same database as the graph.

This culture is the project's best asset. The risk is that the same discipline was not applied to the
product path during the presentation and design rounds (section 6).

## 6. What the history teaches (judgment)

- **The effort went where it was visible.** Of the 82 completed items, 44 are design-round items on
  the graph canvas, its spring, its painter and its comparisons. The roadmap's Phase 4, which covers
  verification, operations and deployment, has none of its seven items done. The governance loop (F-01),
  onboarding (F-02) and ingestion (F-03) are not on the board at all. [repo][juicio]
- **Demos were built on shortcuts.** The Spanish demo graph writes `ACTIVE` nodes straight into the
  database. That is a sound decision for a demo and a dangerous one for a product, because it hides a
  missing transition. The lesson is to mark demo-only shortcuts in code and in the seed report.
- **The documents were generated, then corrected by hand.** Generated documents drift. The four
  inconsistent test counts (section 03 §4) are the visible symptom. The fix is to produce the counts
  from a command, not to type them.
- **Decisions were revisited within days.** That is healthy when recorded, and expensive when the
  record is not kept current. The ADRs do record the reversals, which is why they are trustworthy.
- **Single-author history.** All 151 commits share one author. The reviews and ADRs show that the work
  was reviewed by agents and by the author, but no second human has reviewed it. This is the largest
  operational risk and is covered in `14`.

## 7. The product's core bet, stated plainly

The bet is that **a community can grow a shared knowledge graph faster and more fairly than a committee
can, if every change is visible, attributable to a pseudonym, and reversible through governance**. The
architecture serves that bet: pseudonymous authorship, proposals instead of overwrites, votes with one
per person per target, and agents that suggest rather than decide.

The bet is not yet tested by use. Nothing in the repository measures whether the suggestions are good,
whether people vote, or whether a graph of a few hundred nodes becomes more useful than a spreadsheet. The
first pilot should answer those questions before the platform is extended. This is the most important
judgment in this pack. [juicio]

## 8. What "done" means today

| Claim | True today? | Note |
| --- | --- | --- |
| The API core is implemented | Yes | About 35 endpoints; tested. [run] |
| Identity works against an IdP | Yes, in code and in unit tests; not exercised end to end against a real IdP in this repository | No IdP runs in Compose. [repo] |
| A person can join a workspace by event code | Yes | Anonymous, bound to one workspace, with capacity and expiry. |
| An institution can add its members | No | F-02. |
| Content can move from proposed to active through the product | No for nodes and edges; yes for proposals and classes | F-01, F-16. |
| The AI pipeline runs end to end on live input | Partly | The embedder and Relator run on nodes; the Extractor has no producer. F-03. |
| The system can be deployed | No | No API or web images, no infrastructure code, no deployment job. [repo] |
| The non-functional targets are met | Unknown | Not measured. F-13. |
