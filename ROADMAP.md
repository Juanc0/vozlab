# Roadmap

Open work only. Completed tasks, the old phase plan and the per-task prompts are
frozen in [docs/archive/](docs/archive/); the decision record is
[docs/decisions/](docs/decisions/) and the component specs are
[docs/spec/](docs/spec/).

**Rules:** one checkbox = one PR-sized batch that leaves `pnpm turbo run build
type-check test` green; update the status matrix in [docs/README.md](docs/README.md)
when a requirement moves; if a task is ambiguous, stop and ask with options and
trade-offs before coding.

## Current state (2026-10-19)

- API core complete: nodes, edges, proposals/governance, ontology, discussions,
  interactions/votes, subgraph, multi-tenancy, rate limiting, soft delete,
  keyset pagination, event publication.
- Auth flow complete (FR-01/02/03): OIDC login/callback with PKCE, JIT accounts,
  rotating refresh sessions, logout, `/auth/me` and event-code join.
- 29 test files / 159 TypeScript unit tests green plus 4 web files / 16 tests;
  opt-in integration suite (5 files / 29 tests) green against local
  PostgreSQL/Redis; Python worker runtime has 105 green tests (`uv run pytest`);
  `build` + `type-check` green; CI runs the TypeScript gate, the Python gate and
  the worker image builds.
- Phase 2 in progress: shared `vozlab_worker` runtime, the embedder (FR-18),
  the Relator (FR-19), the Extractor (FR-17 partial) and the source registry
  (FR-17 prerequisite). The Consolidator handler, the ingestion producer,
  observability and broad integration/E2E/load tests are not started.
- Phase 3 done: `apps/web` is a working SvelteKit 5 PWA. It builds, serves
  SSR and ships a manifest and a service worker (3.1); the runes state, the
  per-tab workspace and the HTTP client (3.2); the route groups, the session
  guard and the workspace selector (3.3); the Cytoscape canvas with its
  bounded subgraph (3.4); the ontology-driven creation forms, the proposal
  review, the discussions and the optimistic voting (3.5); the offline shell,
  the install and update prompts and the accessibility pass (3.6); a
  Playwright suite of 14 tests (3.7); and the presentation round: a Spanish
  demo graph of 24 nodes and 35 relations in three clusters (3.8), the
  development sign-in (3.9), the interface in Spanish and English (3.10), the
  workspace window (3.11), the exploration view (3.12), the inspector
  (3.13) and the mobile-first layout (3.14). The API grew three things for
  it: the published response DTOs, the active `datatype_properties` and the
  edge score in the subgraph.
- Known debt: `pnpm lint` is red (24 pre-existing `@typescript-eslint/no-explicit-any`
  errors); `PATCH`-style limitations are documented in the ADRs.

## Batch 1U — Close-out (done)

- [x] B1: `DrizzleNodeRepository.applyDelta` filters `deleted_at`, so an
      auto-applied proposal cannot mutate a soft-deleted node.
- [x] L-13: removed the no-op `resolveAuthorHash(userHash, userHash)` from
      `CastVoteUseCase`.
- [x] M-12: `UNIQUE(workspace_id, system_key)` on `meta.ontology_classes`
      (migration `0002`); polymorphic proposal targets stay validated at
      creation and documented.
- [x] Pseudonymity: random opaque per-user `author_hash`, no salt
      ([ADR-0013](docs/decisions/ADR-0013-random-opaque-pseudonym.md)); the
      guard requires the `authorHash` claim.
- [x] Type-check covers `apps/api/tests/**` and `packages/database/scripts/**`
      (`tsconfig.tests.json`, `tsconfig.scripts.json`, `pnpm type-check`).
- [x] Thin CI: `.github/workflows/ci.yml`.
- [x] Documentation restructure + archive; `TODO.md`/`EXECUTION_PLAN.md`
      replaced by this file.

## Batch 1V — Auth flow (done)

Goal: close the last API-core gap (FR-01/02/03) and make the pseudonym model
real. Decisions: rotating **opaque** refresh token in an `HttpOnly` cookie
(access JWT stays in memory), and tenant resolution from `tid` (Entra) or `hd`
(Google Workspace); `iss`-only resolution stays unscheduled.
Result: 114 tests green; `build` + `type-check` green.

- [x] `router.event_codes` registry + migration (global exception to ADR-0002,
      [ADR-0019](docs/decisions/ADR-0019-global-event-codes.md)): hashed code,
      tenant/workspace, expiry, revocation, capacity, created_by.
- [x] `GET /api/v1/auth/login` — OIDC authorization URL with state + nonce and
      PKCE S256; state stored single-use in Redis for 10 minutes.
- [x] `GET /api/v1/auth/callback` — exchange the code, validate the ID token
      with JWKS/issuer/audience/nonce, resolve `tid`/`hd`, JIT-upsert
      `auth.users` with a **random** `author_hash`, and set the refresh cookie
      (the PWA obtains the access token via `/auth/refresh`). JIT grants **no**
      workspace membership.
- [x] `POST /api/v1/auth/event-join` — atomically consume the event code,
      create an `ANONYMOUS_EVENT` user with a random pseudonym, add the
      workspace membership and issue a session; expired/revoked codes block
      new joins only.
- [x] `POST /api/v1/auth/logout` — blacklist `jti`, revoke the refresh family,
      clear the cookie.
- [x] `POST /api/v1/auth/refresh` — rotate the opaque token; reuse revokes the
      whole family. Refresh sessions are stored hashed in the tenant DB.
- [x] `GET /api/v1/auth/me` — profile plus workspace memberships, no
      `X-Workspace-ID` required.
- [x] Operator CLI `db:event-code`, tests (mocked IdP/JWKS, no network) and
      docs (ADR-0018, auth guide, API/errors/domain, runbooks, status matrix,
      `.env.example`).

## Phase 2 — AI pipeline (workers)

Kickoff decisions (record as ADRs before coding):

- [x] Embedding pipeline design (FR-18): dedicated embedder consumer;
      agent-only write-back via `PUT /api/v1/nodes/:id/embedding`; Relator
      retries until a vector exists
      ([ADR-0020](docs/decisions/ADR-0020-dedicated-embedding-pipeline.md)).
- [x] Batch ingestion contract: `POST /api/v1/nodes/batch` (schema exists) vs.
      single-node loop; add the route if batching wins. Result: single-node
      loop, no batch route
      ([ADR-0024](docs/decisions/ADR-0024-no-batch-node-endpoint.md)) — the rate
      limiter counts requests, so a bulk route would bypass the write budget.
- [x] Worker stack: Python 3.12 + uv, shared client/config library,
      per-worker consumer groups, `XAUTOCLAIM` recovery
      ([ADR-0021](docs/decisions/ADR-0021-python-worker-runtime.md)).

Milestones:

- [x] 2.1 Worker scaffold + shared Python library (env, logging with
      `x-correlation-id`, JWT minting/refresh for agent identities, API client,
      Redis Streams consumer with consumer groups and retries, tests). Result:
      uv workspace, `packages/worker-shared` + `apps/worker-embedder` scaffold,
      72 Python tests (the embedder handler landed with 2.4, the Relator with 2.5).
- [x] 2.2 `meta.data_sources` registry + `GET /api/v1/ingestion/resolve-source`
      (ADR-0009). Result: registry + agent-only, tenant-scoped resolution route
      ([ADR-0025](docs/decisions/ADR-0025-source-resolution-route.md)); no
      management route for the registry yet.
- [x] 2.3 Extractor: `stream:source_raw` → PII masking → Ollama → API drafts
      ([spec](docs/spec/extractor.md)). Result: `apps/worker-extractor` masks
      the PII locally, resolves the workspace through the registry, extracts a
      draft and creates a `PENDING` node; **nothing publishes
      `stream:source_raw` yet** (the ingestion gateway is still missing).
- [x] 2.4 Embedding computation: `NODE_CREATED` → `nomic-embed-text` (768) →
      `public.nodes.embedding` + HNSW index verified
      ([FR-18](docs/requirements.md)). Result: dedicated embedder worker
      (ADR-0020) + agent-only `PUT /api/v1/nodes/:id/embedding`, `embedding_model`
      /`embedded_at` columns, HNSW index exercised, verified end to end against
      the local stack; there is no backfill for pre-existing nodes.
- [x] 2.5 Relator: vector top-5 → LLM evaluation → merge/edge proposals
      ([spec](docs/spec/relator.md)). Result: `apps/worker-relacionador` reads
      the neighbours through the API (ADR-0022), asks the local LLM and creates
      `PENDING` edges; a `MERGE` verdict is submitted as a merge proposal and
      the API applies the merge when the proposal is approved
      (ADR-0023, ADR-0026).
- [~] 2.6 Consolidator: scheduled cluster synthesis → opportunity published via
      the API ([spec](docs/spec/consolidator.md)); add the opportunity endpoint.
      **Deferred for MVP** (2026-10-26): not needed to ship; moved to
      "Tracked, not scheduled" until a concrete use case appears.
- [x] 2.7 Worker Dockerfiles + compose profiles + worker tests; update
      `runbook-ops.md`. Result: a Dockerfile per worker (uv, non-root,
      `--frozen`), a `workers` compose profile, the Python suite and the image
      builds in CI, and the runbook updated. The API image and the deployment
      pipeline remain Phase 4 (4.6).

## Phase 3 — PWA

- [x] 3.1 SvelteKit 5 + Tailwind + PWA scaffold (SSR, service worker, manifest).
      Result: `apps/web` is a working SvelteKit 2.70 / Svelte 5.57 / Vite 8 /
      Tailwind 4 app on adapter-node; it builds, serves SSR and ships a
      generated manifest and service worker in `prompt` mode (a new version
      never swaps assets silently). 16 web tests. The state layer, the route
      groups, the canvas, the governance UI, the offline shell and the E2E
      suite are 3.2 to 3.7.
- [x] 3.2 Runes state + per-tab `sessionStorage` workspace + HTTP client that
      injects `X-Workspace-ID`. Result: `WorkspaceState` (per-tab
      `sessionStorage`, never `localStorage`), `SessionState` (access token in
      memory only), a context-provided state (no module singleton — it would
      leak across SSR requests) and an `ApiClient` that injects the three
      headers, surfaces the `{ code, message }` envelope as a typed
      `ApiError`, clears the session on `401` and switches workspace on
      `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`. 38 web tests.
- [x] 3.3 Route groups `(auth)` / `(app)`; clean URLs. Result: `(auth)/login`
      and `(auth)/join` are real (the OIDC redirect and the event-code join
      exist since Batch 1V), `(app)` carries a four-state guard
      (`restoring`/`ready`/`no-membership`/`failed`) with a sidebar and a
      per-tab workspace selector, and `/auth/callback` lands the OIDC
      failures outside both groups. The workspace is never a path segment.
      81 web tests.
- [x] 3.4 Cytoscape graph canvas + subgraph loading. Result: the instance is
      created once, the elements are patched on a change and the instance is
      destroyed on unmount; `dagre` is registered once at module level with a
      deterministic layout and no physics. The subgraph is bounded (3 hops,
      200 nodes) and the bound is stated in the UI. The canvas has a real
      text alternative (two tables) because a `<canvas>` is invisible to a
      screen reader. The refresh is serialised across tabs (Web Locks) so
      the rotating refresh cookie cannot log out two tabs at once.
      124 web tests.
- [x] 3.5 Node/edge creation, proposal review (approve/reject), discussions and
      voting UI with optimistic updates. Result: the node form is built from
      the ACTIVE `datatype_properties` (and the relation picker only offers
      the relations valid for the source class); the proposals page lists,
      filters, pages and resolves proposals; the discussions page threads,
      replies, closes and deletes; the vote is optimistic and rolls back to
      the exact previous value on a refusal. The approve/reject gate is the
      **target's** maintainer, as the API decides it. The API gained the
      active `datatype_properties` and the edge score in the subgraph.
      218 web tests.
- [x] 3.6 PWA/offline shell, install prompt, accessibility pass. Result: the
      writes are refused **before** the request leaves the tab when the
      browser is offline (`ERR_OFFLINE`, nothing is queued), the service
      worker serves a real offline document for a navigation whose network
      failed, the install control appears only when the browser offered one
      and the update prompt waits for the user. The accessibility pass
      against WCAG 2.2 AA found and fixed 11 issues — a page without a
      title, a 1.2:1 control border, an unnamed vote score, scroll regions
      unreachable by keyboard, two guard states without an `h1`, a list
      without a table, an unassociated error, a missing required state and
      no `prefers-reduced-motion`. The screen-reader-only criteria remain
      for a human handoff.
- [x] 3.7 Playwright E2E for the critical journeys (see `spec/web-pwa.md`).
      Result: 10 Playwright tests over the join, the bounded subgraph, the
      node creation, the proposal review and resolution, the discussion with
      its nested reply, the optimistic vote and its rollback, the offline
      refusal and the correction proposed through the UI. The suite opens a
      real session through the event-code join and cleans up after itself.
      It is opt-in — `pnpm --filter @vozlab/web test:e2e` — like the API's
      `test:integration`; the CI job is 4.3.

### Phase 3 — follow-up (presentation readiness)

Requested after 3.7, to present the product to the university community.

- [x] 3.8 A realistic seed in Spanish: three independent focus clusters,
      each with a handful of nodes and the relations between them, plus the
      proposals, discussions and votes the governance screens need. Result:
      24 nodes and 35 relations in Spanish across *movilidad y transporte*,
      *espacios y accesibilidad* and *vida académica y bienestar*, two
      bridges between them, 4 proposals, 3 threads with 10 posts and 71
      votes. The ontology grew with them — `INVOLVES`, `ADDRESSES`,
      `BUILDS_ON` and `EVIDENCED_BY` join `RELATES_TO`, and the classes
      carry the datatype properties the dynamic form needs. The seed is
      also the workspace's reset button: it removes what it does not own and
      prints the report the presenter reads from the terminal. The nodes are
      authored by the maintainer and the proposals are put forward by the
      member, so the presenter is the one who can approve them.
- [x] 3.9 A development sign-in, so the presenter can act as the maintainer:
      the event-code join grants `MEMBER`, and a member can neither approve
      nor auto-apply. Result: a panel on the login page — **only in a
      development build** — that adopts a token minted by `db:mint-token`.
      The token is verified by the API, not by the browser; it is kept in
      `sessionStorage` so a reload does not cost the presenter the role, and
      that path is dead in a production bundle. The sign-out takes it away.
      The maintainer can now approve the seeded proposals in the app.
- [x] 3.10 i18n: the interface in Spanish (the default) and English, with a
      language selector and the preference kept in a cookie so the server
      renders the right language. Result: one nested dictionary of 358
      paths, with `es.ts` as the source of truth and `en.ts` typed as
      `Dictionary<typeof es>` — a missing, misspelled or leftover key is a
      compile error, so the two cannot drift. The state goes through the
      context API, a `handle` hook rewrites `<html lang>` from the cookie so
      the server renders the right language with no flash, and changing the
      language does not reload the page (the session is in memory). Dates
      and numbers follow the locale through `Intl`.
- [x] 3.11 API: `GET /api/v1/nodes/window` — a bounded window of the
      workspace (the newest nodes and the relations among them) for the
      exploration view. Result: the route answers the most recent nodes of
      the workspace, newest first, and **only** the relations whose two
      endpoints are both in the window — the window is a closed graph, so
      the canvas never meets an unknown node. The limit is clamped to 1–200
      and defaults to 100. The route is registered before `/nodes/:id`, for
      the same reason `/nodes/subgraph` is.
- [x] 3.12 The exploration view, next to the subgraph view: pan, hover and
      click expansion, a selectable focus, the shape of the arrows, dragging
      a node, and a layout that rearranges when the nodes grow. Result: a
      second mode of the graph page — "Subgrafo" / "Explorar" — that draws
      the workspace as a landscape. There is **no root**: the view *presents*
      a node and the criterion is the user's choice (the most recent, the
      most related, or the one they clicked). Hovering opens a **preview**
      with the content of a node or a relation; the badge on a node
      **expands** it into a card and the layout rearranges around it. The
      graph pans, a node can be dragged and keeps its place across a
      re-layout, and the shape of the arrows is a choice — straight, an
      orthogonal route with right angles, and four curves. The list view
      stays the text alternative of both modes.
- [x] 3.13 The inspector: one right-hand sidebar with tabs (content,
      attributes, proposals, forum) shared by both graph views, where the
      selected node or relation can be edited or corrected. Result: a
      right-hand column with four tabs — *Contenido*, *Atributos*,
      *Propuestas*, *Foro* — for the selected **node or relation**; the
      inline detail panel is gone. The actions express the API's asymmetry:
      a relation the user authored can be edited **directly**
      (`PATCH /edges/:id`, author only) and everybody else gets a
      **correction proposal**; a node has no direct edit route at all, and
      the interface says so. The column is collapsible so the canvas gets
      the room, and the graph page is no longer capped at `max-w-6xl`.
- [x] 3.14 A responsive layout: mobile-first, the panels become sheets, and
      the canvas follows the window when it resizes. Result: the base styles
      are the phone's and the breakpoints add the columns. The navigation
      becomes a **drawer** below `md` and the inspector a **sheet** from the
      right below `xl` — where before it fell 6 000 px down the page, where
      nobody finds it. Both are real modals: a backdrop, a focus trap,
      <kbd>Escape</kbd> and the focus returned, and the background is
      `inert`. **The canvas now follows the window**: a `ResizeObserver`
      calls `cy.resize()` and nothing else — no re-fit, no layout — so the
      picture stays where the reader left it. Verified at 375, 768 and
      1440 px: no horizontal scroll, the drawing is redrawn at the new size
      and the graph does not move.

### Phase 3 — the design round and the exploration engine

Requested after 3.14: a fresh design for the whole interface, a graph engine
that behaves like a spring, the relations in the interface's own language, and
the backend questions behind "walk through the graph".

Decided, and not to be re-opened without evidence:

- **The design direction is the *accent ladder*** (a light app style dealt
  from a measured library, not invented): one brand hue at full strength only
  on small marks, and its pale tints doing all the area work. The hue is
  VozLab's own blue in place of the dealt raspberry, which the sheet allows.
- **The node is a card**: a rounded rectangle whose height grows with the
  title, with the title inside, wrapped at word boundaries.
- **The API returns the display names**, not the localized one: the graph
  DTOs carry the `{en, es}` map of the class and of the relation, and the
  client picks its language.
- **The graph edge is enriched**: it carries the attributes, the author and
  the dates, not only the topology, so a relation can be expanded like a node.
- **Both graph engines are tried side by side** in a development-only
  comparison, and the choice between them is made by looking at them, not by
  argument. Cytoscape has the wrapped label and the edge programs for free;
  Sigma has the WebGL renderer and the graph store in the client.
- **The navigation is a full request per click**: clicking a node re-requests
  the subgraph rooted at it, at the depth already selected.
- **No Apache AGE.** The review of 2026-10-21 found that AGE is a query
  language, not a concurrency mechanism, that the evidence does not show Cypher
  beating the bounded CTE for this shape, and that the extension is absent
  from every managed PostgreSQL allow-list. The concurrency work is done with
  a version column instead. The trigger that would reopen the question is
  written down in ADR-0027.
- **The shape with right angles is gone.** The user did not like the square
  corners: they read as a diagram of pipes rather than as relations, and a
  relation that turns draws the eye to the turn instead of to what it joins.
  The shape is out of both graphs and the router that computed the turn went
  with it — no shape is routed any more.
- **The product is online-first, not offline-first.** Everything that is
  shown or edited comes from the API; there is no local state and no
  synchronisation, and none is intended. The shell is cached so the app
  opens instantly and can say clearly when the connection is gone. The
  research of 2026-10-21 had argued the bundle size on the grounds of an
  offline PWA — a premise the product owner corrected, and one that has to
  be left out of every argument.
- **The graph engine is not decided.** The research is written down in
  `docs/graph-engine-research.md` and the work goes in the order the
  product owner says: the layout first (it is what decides whether the
  picture is legible), the painter afterwards, judged with the eyes in the
  comparison surface.

- [x] 3.15 The design system: the tokens of the accent ladder, the type, the
      shell, the bars and the page frames. Result: the direction is the
      **accent ladder**, dealt from a measured library of real product
      screens, with the hue of the brand in place of the dealt raspberry
      and IBM Plex in place of the dealt DM Sans. One `@theme` block holds
      the raw palette, the **roles** and the geometry; the five old role
      names are gone and a test fails if one comes back. IBM Plex Sans and
      Serif are **vendored** with their OFL licence, because the PWA is
      offline-first. The panels are flat, the elevation is a tone step, the
      one filled button is the only one, and the accent's share of a screen
      is measured: **zero** leaves of text in the full accent. The contrast
      is measured, not assumed (17.7:1 for the ink, 9.5:1 for the accent
      ink on its tint). The rules live in `docs/design-system.md`.
- [x] 3.16 The node card: the shape, the title inside it, and the word wrap
      that never breaks a word. Result: every node is a **card** — a white
      rectangle with the sheet's 8px radius (Cytoscape 3.34 does have
      `corner-radius`), no edge and no shadow, on the canvas's `--color-ground`
      — with the **title inside it**, wrapped greedily at word boundaries and
      never breaking a word; a word longer than the card widens the card
      rather than spilling out of it. The wrapping is a pure module with the
      measurer injected, so it is tested with a deterministic measurer; the
      browser uses the canvas's `measureText` and falls back to an estimate
      that over-measures by ~20 %, which is the safe direction. The card's
      height grows with the lines, and the meta line under the title carries
      the **type** in the ontology's own language. The status is a mark, not
      a fill: `ACTIVE` wears nothing, the other statuses wear a 2px border.
      The cost is nothing: 200 wrapped cards cost ~1.1 ms of a 16.7 ms frame.
      The spacing was inflated by a `spacingFactor` that turned out to be a
      Cytoscape core option and not a dagre one — removed.
- [x] 3.17 The two engines side by side: a development-only comparison of
      Cytoscape and Sigma.js on the same data and the same interactions.
      Result: a **development-only** surface at `/engines` that draws the
      same window in **three** pictures — Cytoscape + dagre, Cytoscape +
      fcose and Sigma.js + Graphology — with the same cards, the same
      relations and the same interactions, and it measures them: the
      layout takes **44 ms / 807 ms / 1046 ms** and the median frame is
      **16.6 ms** in all three (the slowest is 30.2 / 23.7 / 21.4 ms). All
      three settle and stop. The surface does not exist in a production
      build: the code is behind `import.meta.env.DEV` and a dynamic
      import, and the bundle holds no renderer, no graph store and no
      layout — only the copy of the labels, because the dictionary is one
      shared module.
- [x] 3.18 The names in the interface's language: the API returns the
      display-name map of the class and of the relation. Result: the
      diagnosis was neither the ontology's schema nor the edge creation —
      the ontology always carried `{"en": "Problem", "es": "Problema"}` and
      `{"en": "Relates to", "es": "Se relaciona con"}`. The **graph DTOs**
      carried only the system's keys (`typeKey`, `relationKey`), and the
      canvas painted the key. So `NodeDto` and the two edge DTOs now carry
      the whole `display_names` **map** and the client picks its language —
      the API does not negotiate one, and a missing map is `{}`. The names
      come from a **composition** in the application layer, not a join, so
      neither repository knows the other's schema and there is **no N+1**
      (two reads whatever the size of the answer, proved with 200 nodes).
      The **statuses** are a vocabulary, not a copy string: a map per scope
      typed with `satisfies Record<NodeStatus, string>`, so a missing status
      is a **compile error** in both languages. Nothing in the interface
      prints `RELATES_TO` or `REJECTED_BY_AUTHOR` any more.
- [x] 3.19 The enriched relation: the graph DTO carries the attributes, the
      author and the dates, and a relation expands like a node. Result:
      `SubgraphEdgeDto` carries the relation's **attributes** (the same
      JSONB the full edge returns), its **author** (the pseudonym, never an
      identity) and its **creation instant** — `updatedAt` does not exist:
      `public.edges` has no such column and `EdgeDto` does not carry it
      either, so the API did not invent one. The payload grows a **constant
      135 B per relation** (+16.8% on the demo, +3.7% gzipped), which does
      not compound. A relation **expands into a card** like a node — its
      name, its attributes, its author and its date — with a **leader** in
      the relation's colour joining the card to the middle of its line, so
      it reads as the writing of that relation and not as a box dropped on
      the picture. The badge of a relation is a **square** (the node's is a
      circle) with the same 44 px hit area. The cost of an expanded
      relation is the layout that runs again, not the card.
- [x] 3.20 The ranked traversal and the two missing indexes: the nearest
      nodes become the strongest ones, and the window stops sorting the whole
      workspace. Result: **"the nearest" is now a defined rule** — the
      strongest relation first and, among equals, the most recent
      (`community_score DESC, created_at DESC`) — applied to both arms of
      the traversal, and the answer is cut by strength. The `LATERAL` had
      **no `ORDER BY`**, so the neighbourhood was truncated by whatever the
      index scan produced. The two missing indexes are in: the nodes by
      `(workspace_id, created_at DESC, id DESC)` and the edges by
      `(workspace_id, side, community_score DESC, created_at DESC)`, which
      **replace** the old ones (same prefix, same count). The window stopped
      sorting the workspace: **160 ms → 0.57 ms** on 50 000 nodes, and the
      plan became an index scan. Two traps, both measured, are in the
      decision: Drizzle's `.desc()` emits `NULLS LAST` and cannot serve a
      plain `DESC` (495 ms), and ranking the whole recursive step instead of
      its arms materialises the frontier (8.3 ms → 346 ms). The decision
      and the trigger that would reopen Apache AGE are in **ADR-0027**.
- [x] 3.21 The navigation by clicking: the exploration view re-requests the
      subgraph rooted at the clicked node and re-centres on it. Result: a
      click is a **walk** — one full request per click to the subgraph
      rooted at the clicked node, at the depth already selected, and the
      answer is **merged** into the working set, so walking never loses
      what was already seen. The exploration view gained the depth control
      it lacked; the subgraph mode **re-roots** instead, because a
      neighbourhood has a root, and its picker now agrees with the canvas.
      The picture **does not empty** while the request is in flight: the old
      one stays, the region is `aria-busy` and a polite live region says
      what is happening. A node with no relations is a note, not an error.
      The **far nodes** are the reader's choice — a switch between the whole
      working set and only the focus's neighbourhood — and the counts in the
      interface are the truth. A click also switches the focus criterion to
      *the one the user chose*, so the view does not re-present another
      node under the reader's hand. The list view, the text alternative,
      carries a **Caminar** button per row: the canvas is not reachable by
      keyboard.
- [x] 3.24 The spring of the exploration view: `d3-force` with a rectangular
      collision force of our own. Result: `d3-force` (3 KB) replaces
      `cytoscape-fcose` as the layout of the exploration view, and the
      collision that no library does for cards is written here: axis-aligned
      boxes pushed apart along the axis of least penetration, with the
      neighbours found through a **uniform grid** (1.0 ms per tick at 200
      nodes, 6.2 ms at 1000). The repulsion is charged by the **area** of
      the card, not by its degree — which is the thing force-atlas2 does
      not do. **0 overlapping card pairs**, against fcose's 392 and FA2's
      493. The run is **deterministic** (a seeded LCG and a fixed circle
      start: two runs give exactly the same positions), it **stops by
      itself** (`alpha < alphaMin`, 300 ticks), and it is stepped in
      **slices of 3 ticks per frame** so the reader *sees* the picture
      rearrange and the interface never stalls (3.20 ms of frame). With
      `prefers-reduced-motion` the layout runs in one go and gives the same
      picture. The layout is a **pure module** — no DOM, no canvas, no
      Cytoscape — so it is tested on its own.
- [x] 3.23 The graph page as a full-bleed canvas: the panels over it, and the
      even background of the exploration view. Result: the graph page is a
      **workspace**, not a page — it fills the viewport (`100dvh`), the page
      does not scroll, and the canvas is the whole area on an **even
      ground** (no grid, no dots, no texture). The title, the mode switch
      and the controls live in a **floating toolbar** over the canvas, the
      way Excalidraw keeps its controls, and the **inspector floats** on the
      right. A floating panel is the one thing the design system allows a
      shadow on: it truly floats, it is a solid surface (no glass, no
      backdrop blur) and it has a border, because the canvas behind it is
      the same ground. The panels are `absolute`, so opening one does not
      resize the canvas. The **list view** — the canvas's text alternative —
      is the other half of the same area, one click away, and the canvas
      stays mounted and `inert` behind it. The app's own navigation stays a
      column: the panels that float are the workspace's, not the app's.
- [x] 3.25 The clone of dagre that uses `d3-dag`: a parallel candidate, with
      the cycles broken **visibly** rather than in silence. Result: the
      clone is a **pure module** (`graph/explore/dag-layout.ts`) that breaks
      the cycles by reversing the DFS back edges — the same rule as dagre,
      with the theorem written down — and it **reports** which relations it
      broke, so the reader is told instead of being misled. And the finding
      of the batch is a **live bug**: dagre reverses the back edges in
      silence, so **10 of the 35 arrows of the seeded demo point against
      what the relation says**, today, in production. The clone is nine
      times faster (1.7 ms against 16 ms on the demo, 102 ms against 682 ms
      on 200 nodes) and it is pinned to `quality: 'fast'`, because the
      `medium` preset took **90 seconds** on the same graph.
- [x] 3.26 The living spring: the picture stays half organised and keeps
      drifting between the clusters, and the simulation sleeps when the
      window is hidden. Result: the spring **breathes**. At rest it drifts
      with `alphaTarget` 0.005 at ~12 Hz (raised to 20 Hz in 3.35) — **0.890 ms per tick** at 200
      cards and a greatest movement of **0.281 px per tick**, a drift and
      not a jump; contact with the picture (a pointer moving over the
      canvas, a card grabbed, a card hovered, a node focused, a walk, a
      zoom) raises it to 0.1, and it **cools back in 1.2 s**. A dragged
      card is pinned, its neighbours part, and on release it keeps its
      place. A hidden tab stops the driver and coming back resumes it;
      with `prefers-reduced-motion` the picture runs to rest and does not
      drift. **The attraction is weighted by the relation's
      `communityScore`** — the data the traversal already orders by — so a
      strong relation pulls its cards closer and the clusters grow around
      the strong relations: that is the half-organised picture, not a
      uniform ball. The edge element carries the score now. And the readout
      stops lying: it says **"Viva: se mueve en reposo"**, because a living
      spring never settles; the walk waits for the wake's movement to fall
      (or 900 ms) and then glides. **0 overlapping card pairs** while it
      drifts. Same batch, the research's verdicts on the playground:
      **Sigma.js and `cytoscape-fcose` are gone** — tabs, code, copy,
      dependencies and lockfile — and the two hierarchies say in the
      interface what they cannot do: "Una jerarquía no respira: sus rangos
      son el dibujo".
- [x] 3.29 The workspace's collapsible panels: the navigation folds into a
      **rail of icons** (56 px), the inspector is **collapsed by default**
      (the walk through the graph happens without it) and the root picker
      is **collapsed** with a **search** that matches the title without
      regard to case or accents. The state is remembered in the cookie
      `vozlab_panels`, read by the server hook so the first paint is
      already folded — **never in `localStorage`**. The relation's name is
      also written on an **opaque** plate now, the same colour as the
      ground, instead of one that let the line through.
- [x] 3.30 The zoom as a property of the view: it starts at the fit (the
      whole graph in view), the wheel changes it, and walking only re-centres
      the view — smoothly, without touching the value. Result: the zoom
      stops being imposed. The `MIN_READABLE_ZOOM` clamp is gone, the
      picture is fitted **once** when the view opens (every node inside the
      box) and the reader owns the value from then on: the wheel changes it,
      a re-layout does not, and a walk does not. The range is 0.05–3. The
      value is `null` until the reader chooses one, and a view that opens
      without a choice fits its own picture. The centring is **animated**
      (320 ms, `ease-in-out-cubic`) and the animation carries **no zoom**,
      so it cannot change it by accident. The decision about the fight with
      the spring: **the spring settles first and then the view glides** —
      the node's final place is only known when the simulation stops, and a
      pan towards a moving target would have to be re-targeted every frame.
      With `prefers-reduced-motion` the pan is instant.
- [x] 3.31 The comparison as a common playground: the same workspace frame,
      the implementations as tabs in the same space, each one free to bring
      everything it needs. Result: the comparison is **the graph page's
      frame** — the same floating panels, the same even ground, the same
      toolbar rhythm, the same list as the text alternative — and the five
      implementations are a **real tablist** (arrow keys, `Home`/`End`,
      roving tabindex) that mounts one at a time in the same space: the
      previous one is destroyed, so two engines never draw on the same
      canvas. Each brings **its own** layout, painter and interactions, and
      the comparison says so out loud when an implementation cannot use the
      shared layout. The readout is **per implementation**: a report arrives
      with the id of the engine that produced it, and switching tabs
      forgets the numbers.
- [x] 3.32 The clone of `d3-dag` must not travel in the production bundle:
      it is a candidate, and it weighs 44 KB gzip there for nothing. Result:
      the **arrangement** moved to the development surface (the only module
      that imports `d3-dag`), the module in the graph layer stayed **pure**
      (the cycle detection, the count against the flow, the types), and the
      production canvas receives the clone **through an option** — with a
      **type-only** import, which is erased at compile time. The production
      bundle lost **177 KB raw / 35 KB gzip**, and `sugiyama`, `decross` and
      `zherebko` are in **no file** of it.
- [x] 3.28 A third painter in the comparison: `d3` and a hand-written SVG
      painter, with the card as one `<g>`. **The next batch**, and the
      **full candidate**: the card as one `<g>`, the relations with their
      opaque plates, pan/zoom (`d3-zoom`), drag (`d3-drag`), hover,
      selection, the walk, the list as the text alternative and the readout
      — the same feature set as the incumbent, so the comparison is fair.
      It brings the **living spring** as its arrangement. The research
      measured it: **22.8 KB gzip against 158 KB**, 4 007 DOM elements for
      200 cards / 400 relations, **12.9 ms to build against 114 ms**,
      59.7 fps of pan and 52.2 fps at 1 000 nodes. It **subsumes 3.27** —
      the card as one object comes free with the `<g>` — so **3.27 is off
      the board**: the compound-node mechanism it proposed collides with
      what `elements.ts` already documents (in Cytoscape a compound node is
      sized by its children, and the card is the one that must keep its
      shape). Result: the painter exists as **a candidate in the
      comparison** — `svg/painter.ts` (1 435 lines), `svg/edge-path.ts`
      (375), `svg/camera.ts` (163) — and its card is **one `<g>`**: the
      rect, the title's tspans, the meta line, the badge and the body, with
      the transparent hit rect on top. It draws the **five** relation shapes
      as `<path>`, the label at 11 px on an **opaque** plate of the ground,
      the status dashes and the arrowheads, and it brings the **living
      spring** as its arrangement — the production module, untouched. The
      five shapes and the card's content were extracted into pure modules
      (`edge-path.ts`, `card-content.ts`) that the incumbent uses too, so
      the two painters are the same picture. **The payload**: the painter's
      chunk is **22 988 B gzip** (the research measured 22.8 KB) and the
      production bundle carries **nothing** of it — `d3-selection`,
      `d3-zoom` and `d3-drag` are devDependencies and the built client was
      grepped for them. **At 200 cards (384 relations)**: **4 867** DOM
      elements, **15.3–19.7 ms** to build, **4.90 ms** per frame of the
      spring, **0** overlapping pairs — against the research's 4 007
      elements and 12.9 ms, because this carries the full card chrome and
      not bare nodes. The pan during a wheel is **23.45 ms / 42.6 fps** at
      200 cards, below the research's 59.7 fps: the honest reading is that
      SVG is not free at 200 cards with this much ink, and the comparison
      says so instead of rounding it away. What the eyes said: the card
      **is** the same card — same 8 px radius, same ink, same wrapped title,
      same meta line — and the plate is opaque.
- [x] 3.33 The comparison's chrome: the readout and the essay fold, so the
      picture is the picture — at 1440 and at 375 — and the size selector
      never shows an empty value. Result: the readout **folds to its three
      numbers** — the frame time, the overlapping pairs and the state — and
      the table opens behind "Todas las medidas", with the fold remembered
      across tabs; the essay opens behind "¿Qué es esto?"; the toolbar reads
      as one bar. The chrome went from **28.7% to 13.0%** of the canvas at
      1440 (the free gap from 115 to 566 px) and from **76.9% to 37.6%** at
      375, where the folded readout is one line. The size select cannot
      render an empty value any more: its options include the loaded window.
      **And the suite found a harness defect on the way**: the E2E was
      **reusing the dev API**, so it wrote as one actor against the real
      **30 writes/minute** and the vote journey was refused with `429` — the
      vote was never broken. The suite now owns **its own ports** (`:3100` /
      `:5174`), starts its own API with a **test budget** for the limiter,
      and runs next to a developer's stack instead of borrowing it.
- [x] 3.34 The shell's copy says online-first: the toast no longer promises
      "ready to work offline", which is false — the data needs the network.
      Result: the notice says what is true — **"VozLab ya está en la caché de
      este dispositivo: la aplicación se abre al instante. Los datos
      necesitan conexión."** — and the code stops lying with it: the flag is
      `shellCached`, the handler is `markShellCached()`, the dictionary key is
      `pwa.shellCached`, and the registration error says the app does not
      open without a connection instead of talking about "offline support".
      It was found by looking at a screenshot, not by a test.
- [x] 3.35 The living spring never stops while it is shown: the motion used
      to freeze a few seconds after the first contact, and now it runs for
      as long as the picture is on screen. Result: the freeze was the
      **tick cap of the layout** — a one-pass run rests at 300 ticks, and
      the cap of 600 cut the living spring off while its driver kept asking
      for frames, which is a freeze in disguise. A living spring is now
      never capped and never reports itself settled; it stops only because
      the caller stops it. The idle pace went from 12 to **20 Hz**: every
      card **sways** around its place on a 5 model px circle, a full circle
      every six seconds — about **3 px/s** of travel at the fit — and the
      picture reads as alive instead of almost still, without the
      arrangement walking. The two ways
      of not being shown keep it quiet, as asked: **a hidden browser tab**
      stops the driver (and coming back resumes it) and **a panel that is
      no longer shown** destroys its painter and its spring — another engine
      in the comparison, another route in the graph page. Measured with the
      document hidden: **0 ticks in 2 s** in both the SVG painter and the
      Cytoscape canvas, and both moving again on return; at rest both tick
      at 20/s.

- [x] 3.36 The static engines left the comparison of the engines: the two
      layered arrangements — Cytoscape + dagre and Cytoscape + d3-dag —
      were removed from the playground, with their tab, their copy, their
      files and the `d3-dag` dependency, because a picture that computes
      its places once and stops has nothing to say next to a spring that
      breathes. The comparison now shows the two painters of the living
      spring: the canvas of Cytoscape and the hand-written SVG. The report
      of the reversed relations and the pure module that detected the
      cycles went with them — they only served the layered arrangements.
      Result: `ENGINES` = `d3`, `svg`; `pnpm test` = **613 tests web**
      (75 files); E2E 3/3; `pnpm turbo run build type-check test` green.

- [x] 3.37 The spring learned four things: a dragged card is **released**
      on drop instead of staying pinned, so it keeps moving; the edges try
      to **uncross** — when two of them cross, their endpoints are pushed
      apart, and the picture searches for the arrangement that hurts the
      least, like a gradient descent over the crossings; a **centroid** —
      an invisible control node connected to every visible one — pulls the
      distant nodes back, so the whole graph stays together and on screen
      instead of stretching into a single line (the charge still repels at
      short distance); and the **neighbours** of a common node spread
      around it, equidistant, forming a loose circle. The new forces run
      while the picture is being arranged (alpha ≥ 0.01) and go quiet at
      rest, so the idle breath stays below the shape threshold. The arrow
      of a relation grew from 1.5 to **2 px**, so a relation is always
      seen. Result: `pnpm test` = **613 tests web** (75 files); E2E 3/3;
      `pnpm turbo run build type-check test` green.

      Measuring the freeze surfaced two more defects of the living picture.
      The **charge had no reach**: a card that hangs from a single relation
      was pushed out of the picture forever, so the arrangement grew a few
      pixels a second and the fit eroded — the charge now reaches **900
      model px**. And the **fit of the view was taken from the frames of
      the animation**, before the arrangement had arrived: the cards of the
      edge opened outside the canvas and a click on one missed. The fit is
      now taken from the **one-pass picture at the awake alpha** (400
      ticks) — the same arrangement the animation arrives at, because the
      spring is deterministic. The whole graph opens inside the canvas and
      stays there: **0 of 25 badges outside over 10 s** in the E2E, and the
      three E2E journeys that the moving picture had broken (the walk by
      click, the fit, the walk that pans) pass again.

- [x] 3.38 The picture now opens wide before it organises itself: the seed
      circle grew (spacing 170 → 260) and the links **anneal** — they start
      three times as long and shorten as the alpha decays, so the nodes
      begin far apart and the spring pulls them together gradually, with
      room for the uncrossing on the way. Result: `pnpm test` = **613
      tests web** (75 files); E2E 3/3; `pnpm turbo run build type-check
      test` green.

- [x] 3.39 The tremor of the Cytoscape engine was tamed with **A + B + E**:
      the idle sway dropped from 5 to **2 px**, the idle pace from 20 to
      **12 Hz**, and a **breathing toggle** was added to the comparison
      (on by default; turning it off keeps the picture quiet, and the
      spring only moves when the reader touches it). The toggle calls
      `setIdleSway` on the spring of the engine that is on screen. Result:
      `pnpm test` = **613 tests web** (75 files); E2E 3/3; `pnpm turbo
      run build type-check test` green.

- [x] 3.40 The idle sway dropped again (5 → 2 → **1 px**) and the
      breathing toggle no longer stops the sway on its own: it stays on
      while the picture is shown. The SVG painter stopped stuttering while
      dragging: the dragged card no longer fights the spring's
      `applyPlaces` (it is skipped for the dragged card), and the edges
      are repainted on `requestAnimationFrame` instead of every mouse
      move. Result: `pnpm test` = **613 tests web** (75 files); E2E 3/3;
      `pnpm turbo run build type-check test` green.

- [x] 3.41 Idle no longer stalls: `IDLE_ALPHA_TARGET` went from 0.005 to
      **0.015**, so the picture keeps moving when the pointer rests. Hover
      or selection **pins that one card** (it stops) while the rest keep
      moving; unhover/deselect releases it. Implemented in both engines
      (Cytoscape and SVG) with a refcount so a card that is both hovered
      and selected is not released early. Result: `pnpm test` = **613
      tests web** (75 files); E2E 3/3; `pnpm turbo run build type-check
      test` green.

- [x] 3.42 The idle energy went up again (`IDLE_ALPHA_TARGET` 0.03 →
      **0.08**) and the cool-down stretched to **5 s**, so the picture no
      longer freezes when the pointer rests. Hover/selection now pins the
      node in **both** engines (the Cytoscape bug that left it pinned
      forever is fixed via a reason-tracked refcount). Result: `pnpm test`
      = **613 tests web** (75 files); E2E 3/3; `pnpm turbo run build
      type-check test` green.

- [x] 3.43 The comparison of the engines dropped the **tabs** in favour of
      a **dropdown** (a `<select>`), whose choice is persisted in
      `sessionStorage` so a reload of the tab keeps it. The **wake** on
      mouse movement was removed: the spring breathes on its own at the
      idle pace and only the tab visibility (and unmount) change its
      rhythm. The engines keep their names in both languages. Result:
      `pnpm test` = **613 tests web** (75 files); E2E 3/3; `pnpm turbo
      run build type-check test` green.

- [x] 3.44 The comparison now counts the **edges that cross**
      ("Aristas cruzadas" / "Crossed edges") and ships a **"Repetir
      disposición"** button that re-runs the layout on the current picture
      until the crossings drop to zero (or the picture settles). The
      counter is computed from the rendered segments of both engines. Result:
      `pnpm test` = **613 tests web** (75 files); E2E 3/3; `pnpm turbo
      run build type-check test` green.

- [x] 3.45 The **"Repetir disposición"** button now **shakes** the graph:
      it re-runs the layout eight times in a row (60 ms apart), re-seeding
      the spring each time, so the uncrossing has several chances to settle
      the picture. The counter of crossed edges shows the result. Result:
      `pnpm test` = **613 tests web** (75 files); E2E 3/3; `pnpm turbo
      run build type-check test` green.

- [x] 3.46 The **"Sacudir el grafo"** button no longer shakes on a timer:
      each shake **waits for the layout to settle** before the next, so the
      nodes stop moving in one direction and the next shake starts fresh.
      The living spring is re-synced to the final positions and keeps
      breathing from there. Result: `pnpm test` = **613 tests web** (75
      files); E2E 3/3; `pnpm turbo run build type-check test` green.

- [x] 3.47 The **"Sacudir el grafo"** button no longer blocks the UI:
      each shake runs on a `setTimeout` so the picture repaints between
      shakes, and a shake only starts after the previous one has settled.
      Result: `pnpm test` = **613 tests web** (75 files); E2E 3/3; `pnpm
      turbo run build type-check test` green.

- [x] 3.48 Reverted: the shake on first load was removed (it was not
      effective). The shake stays available only via the button, now named
      **"Desenredar"**. Result: `pnpm test` = **613 tests web** (75
      files); E2E 3/3; `pnpm turbo run build type-check test` green.

- [x] 3.49 The graph page is now **one mode only**: the exploration view
      (the living spring). The subgraph mode, the bounded-subgraph canvas,
      the list of nodes/edges and the root picker were removed. A **search
      box** at the top navigates to a node by title. The SVG painter is
      the only engine (in `lib/graph/svg`); the `/engines` route and its
      views are gone. Result: `pnpm test` = **552 tests web** (64 files);
      `pnpm turbo run build type-check test` green.

- [x] 3.50 The main graph page now has a **"Desenredar"** button next to
      the node search box: it re-runs the layout on the current picture
      until the crossings drop to zero. Result: `pnpm test` = **552 tests
      web** (64 files); `pnpm turbo run build type-check test` green.

- [x] 3.51 The **"Desenredar"** button moved from the floating overlay
      into the **toolbar** of the workspace, next to a node search box, so
      it no longer covers the sidebar. Result: `pnpm test` = **552 tests
      web** (64 files); `pnpm turbo run build type-check test` green.

- [x] 3.52 The main graph page now uses the **SVG painter** as its only
      engine: `ExplorationView` renders `SvgGraphCanvas` instead of the
      Cytoscape canvas. The Cytoscape-specific tests were removed (the
      painter is already covered by `engines-svg-painter`). Result: `pnpm
      test` = **531 tests web** (62 files); `pnpm turbo run build
      type-check test` green.

- [x] 3.53 The **"Desenredar"** button now actually works on the main
      page: `rearrangeTick` is forwarded from the page through
      `ExplorationView` to `SvgGraphCanvas`, so the shake runs. Result:
      `pnpm test` = **531 tests web** (62 files); `pnpm turbo run build
      type-check test` green.

- [x] 3.54 Removed the **arc** and **haystack** edge shapes from
      `EdgeStyle`, `EDGE_STYLES`, the presets and the SVG path builder; the
      control now offers only straight, bezier and unbundled. Result: `pnpm
      test` = **528 tests web** (62 files); `pnpm turbo run build
      type-check test` green.

- [x] 3.55 The zoom of the main graph page now drives the **SVG
      painter's camera**: `zoomIn`, `zoomOut` and `fitView` were added to
      the painter (via d3-zoom's `scaleBy`) and wired through
      `SvgGraphCanvas` and `ExplorationView`. Result: `pnpm test` = **528
      tests web** (62 files); `pnpm turbo run build type-check test`
      green.

- [x] 3.56 Workspace chrome cleanup: the readout panel at the bottom left
      is gone; the inspector collapses with the quiet chevron icon of the
      navigation rail; the expand badge of a node sits **inside** the card,
      at its top-left corner; the inspector floats below the toolbar, and
      the toolbar reorganises its row (search first, view controls, at the
      end the "Desenredar"). Result: `pnpm turbo run build type-check test`
      green (9/9, 528 tests web).

- [x] 3.57 The toolbar spans the full width of the workspace and its row
      distributes (title left, controls spread, "Desenredar" right); the
      expand badge of a node now sits at the card's top-right interior
      corner; nodes expand on **double click** (or the badge, or `E`) and
      relations are **selectable** — click or double click selects a
      relation, it is highlighted and the inspector reads it.
      Result: `pnpm turbo run build type-check test` green (9/9, 528
      tests web).

- [x] 3.58 Selection and chrome corrections: the painter no longer clears
      a relation selection on report — relations really select now
      (verified with a browser test); a single click a card **only
      selects** it — the presented node is no longer auto-expanded, so
      cards unfold by double click, the badge or `E` only; the toolbar is
      one centred set (title to the left, search + controls + both actions
      to its right) and the "two views" hint is gone.
      Result: `pnpm turbo run build type-check test` green (9/9, 528 tests
      web).

- [x] 3.59 The chrome folds into the navigation column: the bar of the
      shell is gone (mark, name, scope and language selector move into
      it — folded, the column keeps only icons and the language opens
      its own menu); a document without navigation loses no control (the
      drawer button floats over the content); the toolbar distributes
      into **three blocks** (title left, controls centred, "Nuevo nodo"
      right) and a folded inspector is replaced by its icon button
      (chevron, no text), placed below the toolbar.
      Result: `pnpm turbo run build type-check test` green (9/9, 529
      tests web).

- [x] 3.60 The floating toolbar breathes: it keeps the **same air toward
      the top and the right** as the gap the shell's grid puts between it
      and the navigation column (28px on the three sides that face a
      border — the pinned `w-full` had to go so the air could shrink it);
      its inner frame follows the same air (title, controls, "Nuevo
      nodo"); the "Nuevo nodo" button is centred in the row and keeps the
      distance; the title stops being shrunk and shows the serif of the
      design system (32px); the toolbar reports its **bottom edge** (not
      its height) so the list, the inspector and the reopen icon hang
      from the edge wherever the panel sits. And the inspector votes on
      **nodes** too: the selected node gets the same vote buttons as a
      relation (optimistic, `POST /api/v1/interactions` with
      `targetType: NODE`, the score read back through
      `GET /api/v1/nodes/:id`, and the ledger keeps the detail and the
      buttons in step). Verified in a real browser: air 28/28/28 and a
      vote of a seeded node (2 → 3).
      Result: `pnpm turbo run build type-check test` green (9/9, 530
      tests web).

## Phase 4 — Platform, QA and operations

- [ ] 4.1 Integration tests with ephemeral PostgreSQL (the repo's
      PG18+AGE+pgvector image or Testcontainers) + Redis. Auth flow suite exists
      against local Compose (`test:integration`); Testcontainers/CI and the
      remaining repositories are pending.
- [ ] 4.2 Coverage thresholds (re-enable `test.outputs: ["coverage/**"]`).
- [ ] 4.3 E2E suite in CI (Playwright).
- [ ] 4.4 Load tests (k6) proving NFR-01/02/03 or revising the targets.
- [ ] 4.5 Observability: Prometheus metrics, OpenTelemetry tracing, dashboards,
      alerts for the real failure modes; NFR-09 monitoring.
- [ ] 4.6 Image builds and deployment pipeline (API, workers, web) with
      migrations as a deploy step.
- [ ] 4.7 Pay down lint debt (`no-explicit-any`) and add lint back to CI.

## Tracked, not scheduled

- Consolidator handler (FR-20): scheduled cluster synthesis (deferred for MVP, 2026-10-26).
- Apache AGE mirroring adapter ([ADR-0004](docs/decisions/ADR-0004-bounded-sql-cte-age-deferred.md)).
- Redis-buffered CQRS vote scoring ([ADR-0005](docs/decisions/ADR-0005-synchronous-vote-scoring.md)).
- SSE notifications ([ADR-0015](docs/decisions/ADR-0015-sse-deferred.md)).
- GraphQL facade ([ADR-0016](docs/decisions/ADR-0016-graphql-rejected.md)).
- `iss`-based tenant resolution (currently `tid`/`hd` only).
- Multi-region / HA topology (not designed).
- HMAC of the IdP subject in the tenant DB (C8, optional): evaluated and
  deferred. Storing `HMAC(subject, key)` instead of plaintext `sub` in
  `auth.external_identities` was considered but rejected for now: the `sub`
  is not a secret, the protection value is marginal, and key management per
  tenant adds operational complexity. Implement only if an institution
  explicitly requires it; the schema already supports adding a `subject_hmac`
  column without breaking existing rows. See the C8 task file for details.

## How to take a task

`.claude/commands/next-task.md` describes the executor workflow; follow it,
then mark the checkbox here with a one-line result and update
[docs/README.md](docs/README.md) if a requirement status changed.
