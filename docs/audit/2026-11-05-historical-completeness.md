# Historical completeness audit — 2026-11-05

## Question

After consolidating `main` and deleting the abandoned branches, does the
repository still contain the work done in the days before, or did the
consolidation drop it? Specifically: the graph canvas (layout, libraries, SVG,
toolbar, inspector), the navigation shell (configuration, tenant selector,
access-request by event code, ordering, behaviours), the member-management
surfaces for both workspace and tenant administrators, and the login-flow
consolidation.

## Method

Everything below is reproducible from the repository. No claim rests on memory.

| Step | Command |
| --- | --- |
| History of `main` | `git log --format='%h %ad %s' --date=short main --since=2026-10-15` |
| Branch that was deleted | `git diff --stat main b957e569c91b90cb7511da0b7f5bce377bc5fa5f -- apps/web` |
| Unreachable objects | `git fsck --unreachable --no-reflogs`, then one `rescue/<sha>` tag each |
| Plan record | inventory of `docs/archive/plans/` and `docs/plans/README.md` |
| Decision record | inventory of `docs/decisions/` |
| Code presence | path and symbol checks in `apps/web/src`, `apps/api/src`, `packages/` |

## Findings

### F1 — `main`'s history is continuous, with no gap in early November

```
e0ee405 2026-11-05 fix(dev): drop eval and the probe temp file …
4a3fc60 2026-11-05 fix(dev): harden the bootstrap script …
8032740 2026-11-05 chore(docker): keep main's Postgres image …
8551ff2 2026-11-05 feat(dev): one-command bootstrap, zrok shares …
420c8e2 2026-11-03 Add docs/frontend-criteria exploration
6fc36be 2026-11-02 docs: documentation, agent config, and roadmap updates
2bf4b07 2026-11-02 feat(web): engines comparison tool and in-progress web changes
64b8944 2026-11-02 docs(plans): close hnsw-recall v1 …
7f5b580 2026-11-02 feat(api): restore filtered HNSW recall via iterative scan (F-04)
338f5a1 2026-11-02 docs(plans): close ontology-governance v1 …
06b91b0 2026-11-01 feat(ontology): property governance + class reject …
0c8a32b 2026-11-01 docs(plans): close node-governance v1 …
9b003d7 2026-11-01 feat(web): /workspace-admin access/codes tables + modals (T3)
99641a4 2026-11-01 feat(web): /workspace-admin members data table + add-member modal (T2)
b776b0d 2026-11-01 feat(web): /admin data tables with modal creation (T1)
```

`main` reaches 2026-11-05. The consolidation was a fast-forward
(`338f5a1..e0ee405`), never a reset or a rewrite: no commit was removed from
`main`'s ancestry.

### F2 — The deleted branch carried no web work that `main` lacks

```
git diff --stat main b957e569c91b90cb7511da0b7f5bce377bc5fa5f -- apps/web
(empty)
```

The branch held five commits that replaced whole trees with stale working
copies (database schema, DTOs, API routes); its remaining commits were
cherry-picked into `main`. Nothing in `apps/web` existed only on that branch.

### F3 — Every unreachable commit is preserved

`git fsck --unreachable --no-reflogs` reported 95 commits — the deleted
branches plus the stash internals they carried. Each one is now referenced by a
`rescue/<short-sha>` tag, so `git gc` cannot reclaim them:

```
git tag -l 'rescue/*' | wc -l   # 95
```

### F4 — Files absent from `main` are superseded, not lost

Every candidate was compared against the implementation that replaced it.

| Absent path (in a WIP snapshot) | Status in `main` | Evidence |
| --- | --- | --- |
| `apps/web/src/lib/components/NodeDetailsPanel.svelte` | superseded | `Inspector.svelte`, `InspectorContent.svelte`, `InspectorAttributes.svelte`, `InspectorProposals.svelte` |
| `apps/web/src/lib/dev/engines/EnginePanel.svelte`, `EngineReadout.svelte`, `EngineTabs.svelte` | superseded | `EngineComparison.svelte`, `SigmaPanel.svelte`, `comparison-data.ts`, `frames.ts` |
| `apps/web/src/lib/dev/engines/dag.ts` | superseded | `fcose.ts`, `settle.ts`, `card-texture.ts` |
| `apps/api/src/domain/ports/IEventCodeRepository.ts` | intentionally dropped | the port had zero references even on its own branch; ADR-0046 replaced event codes with `credential_routes` |
| `packages/database/migrations/{router,tenant}/0000…0007_*.sql` | intentionally dropped | a second, thinner migration lineage that omitted nine of the tables; `main` keeps the single lineage (tenant 8 files, router 5 files) |

### F5 — Every capability named in the request exists in the tree

| Capability | Paths / symbols |
| --- | --- |
| Graph layout | `apps/web/src/lib/graph/explore/{layout,force-layout,orthogonal,focus,zoom,instance}.ts` |
| Graph libraries | `cytoscape ^3.34.4`, `cytoscape-dagre ^4.0.1`, `cytoscape-fcose ^2.2.0` (`apps/web/package.json`) |
| SVG | `apps/web/src/lib/graph/svg/` |
| Toolbar | referenced in 13 files under `apps/web/src` |
| Inspector | `apps/web/src/lib/components/Inspector*.svelte` (4 files) |
| Navigation shell | `AppShell.svelte`, `AppSidebar.svelte` |
| Tenant selector | route `/select-tenant` (HTTP 200) + 3 selector components |
| Access-request by event code | route `/request-access` (HTTP 200) + 8 files touching join codes |
| Member management, workspace | route `/workspace-admin` (HTTP 200); tabs `members`, `codes`, `eventCodes`, `access`, `ontology` |
| Member management, tenant | route `/admin` (HTTP 200); tabs with `systemRole`, `suspend`/`activate`, `joinRequests`, `cleanup` |
| Login consolidation | `9ab77fa` single identity store + provider/anonymous surface deleted; `8040a95` join codes as sole credential; `0688e10` thin credential routing; `0025e7c` invitations under tenant authority; `1e64cde` login-reachable seed identity; ADR-0044/0045/0046 |

### F6 — The plan record lags the code: archived plans with unchecked boxes that are implemented

`docs/archive/plans/tenant-user-management/v1.md` is archived with T2 (`:48`)
and T3 (`:66`) unchecked. Both are implemented:

```
apps/web/src/routes/(app)/admin/+page.svelte:218            role="tablist"
apps/web/src/routes/(app)/workspace-admin/+page.svelte:657   role="tablist"
```

The `/admin` page carries `systemRole`, `suspend`/`activate`, `joinRequests`,
`cleanup` and `createWorkspace`; `/workspace-admin` carries `members`, `codes`,
`eventCodes`, `access` and `ontology` tabs. The same pattern appears in
`admin-data-tables/v1.md:76-82`, `navbar-gating/v1.md:89-93`,
`navbar-join/v1.md:88-92`, `navbar-polish/v1.md:82-86`, `v2.md:53-57`,
`sidebar-reorder/v1.md:98-102` and the `no-workspace-message` series, whose
closure checklists were never ticked although the tasks are marked done.

Reading the plan record alone therefore understates what is built.

### F7 — The graph and canvas work has no plan and no ADR

No plan under `docs/archive/plans/` covers the graph engine, the layout
selection (SVG, dagre, `cytoscape-fcose`) or the floating toolbar, and no ADR
records that decision. The only record is:

- `docs/graph-engine-research.md:161,222,286`
- `docs/components/web-pwa.md:565`
- `docs/spec/web-pwa.md:202-256`
- `ROADMAP.md:173,338,424` (3.17 open at `:354`)

`ADR-0047:52` states that dead Cytoscape code and packages were removed, while
`upgrade-waves/v1.md:30` leaves T0.1 unchecked — and `cytoscape ^3.34.4` is a
live dependency of `apps/web`. The decision exists; the paper trail does not.

### F8 — The ADR index stops at ADR-0026

`docs/decisions/README.md:21-46` lists 0001–0026 only. ADR-0027 through
ADR-0052 exist as files and are not indexed, contrary to the README's own step
5 at `:56`.

### F9 — ADR-0042 is stale and still marked `proposed`

`ADR-0042:11-17` mandates `global_invitations` and `global_identities`, which
`ADR-0045:166,235` deleted. The ADR stays `proposed`, so the decision record
contradicts itself on the identity model.

### F10 — The database data was destroyed; the code was not

The Postgres and Redis volumes were removed during the environment rebuild. The
graph content that lived only in that database is gone. A backup from
2026-10-30 survives at `local-backups/pre-reset-2026-10-30_vozlab_tenant_dev.sql`
holding 92 nodes, 51 edges, 8 edit proposals and, in the router dump, 390 event
codes, under the pre-consolidation schema. The current seed state is 24 nodes
and 35 edges. This is a data loss, unrelated to the code history described
above.

### F11 — Fifteen files exist only in the recovered WIP commits

The full matrix over the 95 `rescue/*` commits produced 76 unique paths present
there and absent from `main`: 61 are superseded by a later implementation and
**15 are genuinely absent** (2,432 lines). They fall into three groups.

**d3-dag layout work (2026-10-21 … 10-22), 1,500+ lines including tests.**
A cycle-aware layered layout built on `d3-dag`, which `main` does not have:

| Path | Lines | What it does |
| --- | --- | --- |
| `apps/web/src/lib/graph/explore/dag-layout.ts` | 340 | finds the graph's cycles, names the relations that close them, measures arrows drawn against the flow |
| `apps/web/src/lib/dev/engines/dag.ts` | 156 | dev-only runner arranging the comparison picture with `d3-dag` |
| `apps/web/src/lib/dev/engines/dag-fixture.ts` | 114 | deterministic fixture *with* cycles plus card sizing |
| `apps/web/src/lib/dev/engines/EngineTabs.svelte` | 103 | tablist with roving arrows, mounts one engine at a time |
| `apps/web/tests/explore-dag-layout.test.ts` | 358 | purity, deterministic cycle breaking, reversal counts |
| `apps/web/tests/explore-dag-bundle.test.ts` | 302 | proves `d3-dag` never reaches the production bundle |
| `apps/web/tests/engines-tabs.test.ts` | 206 | tablist semantics, single-canvas mounting |
| `apps/web/tests/explore-dag-bench.test.ts` | 181 | settle time, overlapping card pairs, determinism |
| `apps/web/tests/engines-dag.test.ts` | 180 | hands the clone to the picture and reports reversed relations |
| `apps/web/tests/explore-living.test.ts` | 173 | living spring: breathes at rest, wakes on touch, pauses in a hidden tab, honours reduced motion |
| `apps/web/tests/fixtures/StubSigmaPanel.svelte` | 31 | test double for the WebGL Sigma panel |

`main` implements a different layout: `explore/layout.ts` configures dagre and
`fcose.ts`/`force-layout.ts` provide the force model, with no cycle detection
(`git grep -i cycle main -- apps/web/src` → 0). The two are not the same work.

**Identity-provider port (retired by decision, 2026-10-28):**
`ITenantIdentityProviderRepository.ts` (35) and
`TenantIdentityProviderController.ts` (69). Deliberately removed —
`apps/api/src/infrastructure/http/routes.ts:400-403` records the retirement
(identity-consolidation T7, audit D-2) and the router migration drops the table.

**One-shot backfills (2026-10-28):** `backfill-external-identities.ts` (55) and
`backfill-global-identities.ts` (129). Neither name appears anywhere in `main`
(`git grep -rn backfill` → 0 hits).

Recovery: `rescue/8b863d29`, `rescue/35c73cfe` (d3-dag), `rescue/c7f72408`
(living spring), `rescue/3ab7981e` (port and backfills).

### F12 — No front-end work was committed after 2026-11-02

```
git log -1 --format='%h %ad %s' --date=short main -- apps/web
2bf4b07 2026-11-02 feat(web): engines comparison tool and in-progress web changes
```

Commits per day over the whole window: 11-01: 45, 11-02: 10, **11-03: 1**
(`420c8e2`, docs only), **11-04: 0**, 11-05: 4 (dev and bootstrap). The latest
web feature commit is from 11-02, and the recovered WIP objects are dated
2026-10-20 … 10-28. There is therefore no repository evidence of front-end work
on 2026-11-03 or 2026-11-04: any such work was never committed and is not
preserved in an unreachable object either.

## Root cause of the reported symptom

The code for every named capability is present and reachable. Four factors
combine into the impression that it is not:

1. **Empty states.** The database was rebuilt from the seed, so screens that
   display content render their empty state. The member tables, join-code
   tables and graph show nothing to list.
2. **Stale plan checkboxes (F6).** The documentation says unfinished where the
   code is finished.
3. **Missing graph record (F7).** The graph work cannot be found in the plan or
   ADR system at all, which reads as "it was never done".
4. **Browser caching.** `apps/web/build/client` from 2026-11-02 remains on disk,
   and a service worker registered by an earlier production build stays active
   in the browser until unregistered, serving cached assets on the same origin.
5. **One part of the remembered work was genuinely never merged (F11).** The
   cycle-aware `d3-dag` layout and the living-spring behaviour exist only in
   recovered WIP objects from 2026-10-21/22. `main` ships a different layout
   (dagre + fcose, no cycle detection). This is the one place where the
   recollection is accurate, and the only candidate for recovery.

## Proposed solutions

| # | Action | Addresses |
| --- | --- | --- |
| S1 | Tick the closure checklists of the archived plans whose tasks are implemented, or record why a task was abandoned | F6 |
| S2 | Add an ADR for the graph engine and layout decision (SVG vs dagre vs fcose, and the floating toolbar), pointing at `docs/graph-engine-research.md` | F7 |
| S3 | Complete the ADR index from 0027 to 0052 | F8 |
| S4 | Resolve ADR-0042: mark it `superseded by ADR-0045` or rewrite it to the implemented model | F9 |
| S5 | Reconcile `upgrade-waves T0.1` with `ADR-0047:52` and with the live `cytoscape` dependency | F7 |
| S6 | Delete `apps/web/build/` (a 2026-11-02 build) and document unregistering the service worker when a stale UI appears | cache |
| S7 | Restore graph data from `local-backups/` by extracting nodes and edges into the current schema, if the content matters | F10 |

## Appendix B — where the graph-engine evidence lives

The comparison programme is documented, with measurements, in
`docs/graph-engine-research.md` (288 lines):

| Section | Contents |
| --- | --- |
| §1 | the use case in the product owner's words |
| §3.1–3.2 | the candidates and the d3 ecosystem reference |
| §3.3–3.4 | the premise that was wrong, and whether SVG is too heavy |
| §4, §4.1 | what arranges the graph, and edge routing |
| §5.1–5.3 | the shortlist and the order that follows from the use case |
| §6–§8 | open findings, how to measure honestly, sources |
| **§9** | **what has been built since** — one row per roadmap item with its outcome and numbers |

§9 records, among others: the living spring (3.26, 3.35) with bounded breath,
wake, charge, no ticks in a hidden tab and a still picture under
`prefers-reduced-motion`; the `d3` + SVG painter (3.28) at 22 988 B gzip,
4 867 DOM elements at 200 cards, 15.3–19.7 ms to build and 4.90 ms per spring
frame, 42.6 fps panning against Cytoscape's 57.2; and `d3-dag` (3.25) at 1.7 ms
against dagre's 16 ms, together with the finding that **dagre reverses 10 of the
35 arrows of the seeded demo in silence** — the reason a cyclic graph cannot
trust a DAG layering.

Where each piece lives in code:

| Piece | Path |
| --- | --- |
| SVG painter | `apps/web/src/lib/graph/svg/painter.ts` (53 KB), `edge-path.ts`, `camera.ts` |
| SVG canvas (built, never mounted) | `apps/web/src/lib/components/SvgGraphCanvas.svelte` — no route or component imports it |
| Spring and frames | `apps/web/src/lib/dev/engines/{spring,settle,frames}.ts` |
| Forces: charge, collision, centroid | `apps/web/src/lib/graph/explore/force-layout.ts:1005-1008` |
| Gravity | `apps/web/src/lib/graph/explore/layout.ts:132-133` |
| Production renderer today | `GraphCanvas.svelte` and `ExplorationCanvas.svelte`, which import `cytoscape` |

The "invisible hub node" has no literal node in the code (`grep -ri hub` → 0
files). Its effect is produced by the `centroid` force at
`force-layout.ts:1005-1008` ("the charge repels at short distance, and the
centroid pulls the distant") together with the `gravity` parameter at
`layout.ts:132-133`: distant nodes are pulled inward so a long line folds back
into the viewport.

**Conclusion:** the SVG engine and its spring were built and measured as the
candidate recorded in 3.28; production still renders with Cytoscape. The switch
is a documented open item, not a completed one.

## Appendix — rescue inventory

The full per-file matrix over the 95 `rescue/*` commits is recorded separately;
F4 lists the files whose classification required a judgement call. Every other
file present in a rescue commit and absent from `main` fell into the same
categories: a migration from the discarded lineage, the dead
`IEventCodeRepository` port, or a component that `main` reimplemented under a
new name.
