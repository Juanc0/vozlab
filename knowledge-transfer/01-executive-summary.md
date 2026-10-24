# 01 — Executive summary

## The verdict

VozLab is a **well-engineered prototype with an unusually disciplined decision record**, but it is **not yet
a product that an institution can run**. The core is sound: a Fastify API with real hexagonal boundaries,
physical per-institution databases, a guard chain that rejects cross-tenant access by construction, typed
contracts from a single schema package, 27 architecture decisions with their trade-offs written down, and
green tests. For a project that started on 2026-10-09 with one contributor, the quality bar is high. [repo][run]

What is missing is not more features. It is **closed loops and operational foundations**:

- the governance loop does not close through the API (content proposed by people or agents cannot reach
  `ACTIVE`, and agent-authored suggestions cannot be approved by humans) — **F-01**;
- an institution cannot put its own people into a workspace through the product — **F-02**;
- the API trusts one identity issuer, so a second institution on another provider cannot sign in — **F-17**;
- the AI pipeline has no live input and no way to measure whether its output is good — **F-03, F-13**;
- nothing can be deployed, observed or measured against the non-functional targets — **F-05, F-11, F-13**.

I would **not replace the core technology stack now**. The architecture can carry the next year.
The work is to close the loops, pay down a few upgrades that carry security exposure, and make the
first deployment boring.

## What is strong (keep it)

1. **Isolation is physical, not promised.** One database per institution, the connection chosen before any
   repository runs, and workspace membership checked on every request. [repo] `docs/architecture.md`, ADR-0002
2. **Decisions are recorded and reversible in principle.** 27 ADRs state context, alternatives and costs,
   and several rejections are explicit (GraphQL, AGE, CQRS votes, batch endpoint). [repo] `docs/decisions/`
3. **Contracts are typed end to end.** Zod schemas in `packages/shared-types` feed the API and the PWA;
   the 358-path Spanish/English dictionary is compile-checked for completeness. [repo]
4. **The AI pipeline is cautious by design.** Agents create `PENDING` artefacts, reject hallucinated
   identifiers, mask PII locally before a model sees text, and never write SQL directly. [repo] ADR-0020, ADR-0023
5. **Tests and build are green.** API 195 tests, web 515 tests, Python 105 tests; type-check passes;
   the Python ruff gate passes. [run]

## The findings that matter

Severity reflects impact on the next milestone: **Critical** blocks a pilot, **High** blocks a credible
demo or a deployment, **Medium** creates risk that grows with use, **Low** is hygiene.

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| **F-01** | **The governance loop does not close.** Every node and edge created through the API is `PENDING`, and no route moves it on. ADR-0026 states the consequence ("no route activates a node") and it was accepted without a schedule. Relator-created edges cannot be accepted or rejected. Agent-authored nodes and edges are maintained by the agent identity, so a human cannot approve proposals on them. | [repo] `Node.ts` transition table; `CreateEdgeUseCase`; `proposalAuthorization.ts`; ADR-0026. The seed sets `ACTIVE` directly in the database, which hides the gap. | **Critical** |
| **F-02** | **No way to onboard institutional users.** JIT login grants no membership by design, but no route creates or manages memberships. Only the anonymous event-code path grants one. Everything else is a database edit. | [repo] `routes.ts` has no membership endpoints; US-00 says admin endpoints are not built. | **Critical** |
| **F-03** | **The ingestion side has no input.** Nothing publishes `stream:source_raw`, so the Extractor is idle. The spec assumes records are "non-confidential" before they enter Redis, while the worker exists to mask personal data after it reads them. Streams are never trimmed. | [repo] `docs/spec/extractor.md`; `runbook-ops.md` (no `MAXLEN`). | **High** (privacy and product) |
| **F-04** | **Vector neighbours can silently return fewer than five.** The Relator's query filters on workspace and status after an HNSW index scan. pgvector applies filters after the candidate list (`hnsw.ef_search`, default 40), and no iterative scan is configured. | [repo] `DrizzleNodeRepository.findNearestInWorkspace`; [web] pgvector README. | **High** (correctness, grows with data) |
| **F-05** | **Behind a load balancer, every client is one client.** Fastify has no `trustProxy`, so `req.ip` is the proxy's address. The per-IP limits on login, refresh and event-join would share one bucket for the whole institution. | [repo] `server.ts` (`Fastify({...})`, no `trustProxy`); `RateLimitingMiddleware` uses `req.ip`. | **Critical for AWS**, latent today |
| **F-06** | **Credentials sit where they should not.** `opencode.json` is committed with the `mcp_reader` password in plain text. The router stores tenant database passwords in a plain `text` column (documented as a production requirement, not implemented). | [repo] `opencode.json`; `router.schema.ts` line 83; ADR-0002 negatives. | **High** (rotate now, fix before deployment) |
| **F-07** | **The demo laptop is exposed.** `docker-compose.yml` publishes PostgreSQL (`postgres/postgres`), Redis (no auth) and Ollama on all interfaces. On conference Wi-Fi during a presentation, a neighbour can reach them. | [repo] `docker-compose.yml` port mappings without `127.0.0.1`. | **High** (demo-time) |
| **F-08** | **The stack is behind its security lifecycle.** Fastify 4 (LTS ended 2025-06-30), `redis` 4.x (maintenance line), Zod 3, Node 22 (end of life 2027-04-30). Chat default `llama3.1:8b` dates from 2024. | [run] installed versions; [web] Fastify LTS page, endoflife.date. Details in `10`. | **High** |
| **F-09** | **The models are not chosen for Spanish, and nothing measures them.** The embedder uses `nomic-embed-text` (English-centred, 768 dimensions). Chat extraction and relation verdicts use an English prompt and a dated model over Spanish content. There is no evaluation set, so quality is unknown. | [repo] `settings.py` in worker-embedder and worker-relacionador; [web] model comparisons. See `06`, `13`. | **High** (core value) |
| **F-10** | **Local and production diverge.** The Postgres image is built on `apache/age`, which is deferred by ADR-0027. ADR-0027 also says the image should stop depending on AGE, which has not happened. AGE is not offered by Amazon RDS. The local stack cannot be lifted to managed PostgreSQL as it is. | [repo] `docker/postgres/Dockerfile`, `02-extensions-and-graph.sql`; [web] apache/age issue #998. | **Medium** |
| **F-11** | **Tenant fleet operations do not exist.** Creating an institution is a set of manual steps. Migrations run against one database through an environment variable. There is no per-tenant backup or restore procedure. Connection use is `tenants × replicas × 10`. | [repo] `drizzle.tenant.config.ts`; ADR-0027 §4; `ConnectionPoolManager` (`max: 10`). | **High** before the second institution |
| **F-12** | **Events are lost when Redis is down.** Publication is fire-and-forget with no outbox. A node created during a Redis outage is never embedded or evaluated, and nothing retries it. | [repo] `runbook-ops.md`; `architecture.md` §Redis; NFR-10 partial. | **Medium** |
| **F-13** | **Nothing is measured.** No metrics, traces, dashboards or load tests. NFR-01, 02, 03 and 09 are unverified. Ollama and tenant databases are not in readiness checks. | [repo] `runbook-ops.md`; `requirements.md`. | **High** for any SLA claim |
| **F-14** | **The documents disagree with each other and with the code.** The test counts differ across four documents (see `03` §4). The README header says the PWA "has just started" while its own table says it is complete. One author wrote all 151 commits. | [repo] README, ROADMAP, docs/README, AGENTS; [run] counts. | **Medium** |
| **F-15** | **No browser security headers.** No Content-Security-Policy, no HSTS configuration, no frame or content-type policy on the PWA or the API. | [repo] no CSP in `svelte.config.js`, `hooks.server.ts`, `server.ts`. | **Medium** |
| **F-16** | **The ontology cannot yet grow through governance.** Only classes can be activated. Proposed properties stay `PROPOSED`. Ontology proposals cannot be voted on. Property `system_key` is not unique, so lookups return the first match. | [repo] `domain-model.md` §5, §9; `interactions_log` target types; routes list. | **High** for the vision |
| **F-17** | **The API trusts exactly one identity issuer.** The issuer and JWKS URL are single environment values, and the token check requires that issuer. Google Workspace works across institutions; a multi-tenant Entra setup works for one tenant only, because Entra issuers are tenant-specific. Mixed providers are impossible. | [repo] `env.ts`; `OidcProviderClient.ts` (`jwtVerify` with a fixed `issuer`; `tid ?? hd`). [web] Entra issuer format (Microsoft identity platform). | **Critical** for multi-institution |

Details, fixes and the order of work are in `09` (security), `05` (data), `06` (AI), `07` (ontology),
`08` (identity) and `15` (roadmap).

## Short answers to your concerns

**1. Technologies: up to date, well suited, sustainable?** Mostly yes in choice, no in version. The choices
(TypeScript, Fastify, Drizzle, PostgreSQL with pgvector, SvelteKit 5, Python workers on Redis Streams,
Ollama for local models) are mainstream and defensible. The versions are behind (F-08). Three choices need
a decision: Redis (move to **Valkey** where managed, see `11`), the embedding and chat models (`06`), and
AGE (drop it from the default image, see `05`). App Runner is closed to new AWS customers since
30 April 2026, so it is out of the plan. [web]

**2. Coherence across infrastructure, architecture, security and communication.** The core is coherent:
the guard chain, the ADRs and the typed contracts agree with each other. Three seams are not:
(a) documentation versus code (F-14); (b) the local image versus production (F-10); (c) the product's
lifecycle versus its governance (F-01). Fix (c) first, because it is a product gap, not a documentation one.

**3. Holistic understanding of the ecosystem.** `04` gives the whole picture: components, flows, failure
modes and who owns what. The honest caveat is ownership: every responsibility is held by one person,
and the agent tooling (six subagents, two commands, 56 skill folders) amplifies output but does not
add an independent reviewer. [repo]

**4. Guests, tenants and multi-workspace access.** Today a person has **one account per institution**, and
inside an institution one account can belong to **several workspaces**. A session carries one tenant.
A guest is an anonymous event member bound to one workspace. Guest access by invitation code therefore fits the
current model with little work. The structural blocker is different: the API trusts **one** identity issuer (F-17),
so a second institution on a different provider, or a second Entra tenant, cannot sign in at all. A single identity across institutions requires a global identity table in the
router, which contradicts ADR-0002 and creates a cross-institution linkage risk. My recommendation is to
extend codes into invitations, use the identity provider's guest mechanism for institutional outsiders, and
defer the global identity until a real need is documented. Full analysis in `08`.

**5. A graph database for an ontology that grows from community input.** Do not add a graph database yet.
PostgreSQL is the system of record, and the recursive query is adequate for the scale this will reach for
years. Graph analytics (communities, centrality, paths) belong in a Python analytics job that writes derived
tables. A dedicated graph engine becomes a **read projection** only after events are reliable (an outbox,
F-12). Kùzu, the embedded engine some write-ups recommend, was archived in October 2025 after its acquisition
by Apple, so it is out. [web] Options and triggers are in `07`.

**6. AI agents.** The pipeline logic is careful. The problems are inputs (F-03), governance of agent output
(F-01), model fit for Spanish (F-09), the absence of any evaluation harness, and prompt injection from
untrusted records, which has no mitigation written down. Each of these has a concrete fix in `06`.

**7. Scalability on AWS, and running locally at no cost.** Target: ECS (Fargate, or ECS Express Mode) for the
API, the web server and the workers; RDS or Aurora PostgreSQL with pgvector and no AGE; ElastiCache for
Valkey; and either Amazon Bedrock or a GPU instance for models, decided by residency. The per-institution
database scales by mapping tenants to hosts in the router, which the design already allows, but it needs a
connection pooler and a fleet tool first. For the presentation, `docker compose` is already a zero-cost
stack. LocalStack Community no longer runs without an account, so an emulator is optional; Floci or Moto cover
the cases that matter. Details in `11` and `12`.

**8. Internationalisation.** The interface is in good shape: a typed dictionary, a cookie-driven server render,
and `Intl` formatting. The **content** is not modelled: records have no language, there is no translation
strategy, and the things that really depend on language (embeddings, the chat model, PII patterns) are
English-centred. The plan is phased: keep the dictionary, add a language tag to content, select multilingual
models by evaluation, and extend PII detection to Spanish. Full options in `13`.

## Ten decisions I need from you

These are the questions that change the plan. The full register is in `15`.

1. **Horizon.** Is the next milestone a stable presentation (weeks), a pilot with one real institution
   (one to two months), or both? This sets how much of `15` is in scope now.
2. **Onboarding and identity.** Who adds people to a workspace in the pilot, and how: invitation codes, IdP
   guests, or a small admin screen? (F-02) And which identity provider does the first institution use, since the
   API trusts one issuer today? (F-17, D-21)
3. **Approval semantics.** Who approves a new node or a Relator-suggested edge: the author, a moderator, a
   vote threshold, or the agent after a human review? (F-01)
4. **Jurisdiction and residency.** Which law governs the listening data, and must it stay in a given region?
   The tenant slug `sabana` suggests a Latin American institution; please confirm. [supuesto] This decides the
   AWS region and whether models can leave your premises.
5. **Model hosting.** Local models on a GPU you control, or a managed model service (Bedrock) under a data
   processing agreement? (`06`, `11`)
6. **Model evaluation.** May I help you build a small Spanish evaluation set (records, duplicates, edges) and
   run the candidate models against it? Nothing in the choice should be decided by a leaderboard. (F-09)
7. **Languages.** Which languages must content and interface support in the next twelve months? (`13`)
8. **Guests.** Are guests people from other institutions, members of the public, or both? (`08`)
9. **Budget ceiling** for the pilot hosting, and whether the institution pays for cloud. [supuesto]
10. **Upgrade window.** Can you accept a planned upgrade sprint for Fastify 5, Zod 4, the Redis client and
    Node 24 (about two to three weeks, see `10`), before new features?

## The next thirty days, in one paragraph

Rotate the committed credential and bind the demo ports to localhost (F-06, F-07). Set `trustProxy` and
write the deployment blockers down as tests (F-05). Close the governance loop with an explicit approval rule
and the missing transitions (F-01, F-16). Add membership management for administrators (F-02). Decide the
identity-issuer design for the first provider (F-17, D-21). Fix the
Relator's recall with an iterative scan and a test against a multi-workspace dataset (F-04). Start the model
evaluation (F-09). Begin the dependency upgrades in a branch with the test suite as the safety net (F-08).
Put one honest status page in front of stakeholders, generated from the test runs rather than typed (F-14).
