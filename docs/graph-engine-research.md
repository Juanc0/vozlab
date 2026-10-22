# The graph engine — the research and the shortlist

**Status**: research, not a decision. The shortlist below is a proposal and
an order of work, not an architecture that has been adopted. The product is
going to try them **one at a time, in the order the product owner says**.

- **Date of the research**: 2026-10-21 (two passes, both read-only)
- **Scope**: what *draws* the graph (the painter) and what *arranges* it
  (the layout)
- **Not in scope**: the model and the API. The API's read path was
  reviewed separately and the outcome is
  [ADR-0027](decisions/ADR-0027-ranked-traversal-and-age-trigger.md).

## 1. The use case, in the product owner's words

> que sea interactivo agradable, dinamico, responsibo con fuerzas que
> reorganicen el grafo pero se dejen medio organizra moviendo nodos entre
> otros etc.

That sentence is the requirement the tables below are judged against, and
it is stricter than any feature list:

1. **Interactive and pleasant** — the picture answers the pointer, it never
   fights it, and it never blocks the interface.
2. **Dynamic and responsive** — the graph *reorganises*: the forces move it
   while it is being read, and the reader sees it move.
3. **Half-organised, with the nodes moving among each other** — this is
   the clause that rules out the two obvious answers. A force layout that
   collapses into a hairball is **not** acceptable: the clusters must stay
   legible, and the nodes must keep drifting between them. The picture is
   *alive but structured*, not *settled into a ball* and not *frozen in a
   hierarchy*.

## 2. A premise that was wrong, and what it changes

The first pass argued the size of the bundle on the grounds that VozLab is
an **offline-first PWA**. It is not, and it was never asked to be: **the
product is online-first**. Everything that is shown or edited comes from the
API, there is **no local state and no synchronisation**, and the shell is
cached only so that the app opens instantly and can say clearly when the
connection is gone (`docs/spec/web-pwa.md` §PWA).

What that changes:

- The bundle still matters — it is the **first load on a phone**, and the
  service worker has to fetch it — but "it must work with the network
  gone" is **not** an argument for a small bundle.
- Every argument in this document that leaned on "offline" is re-stated
  without it. Where a conclusion depended on it, the conclusion is
  marked.

## 3. Part I — what draws the graph

### 3.1 The candidates

Bundle sizes are gzip, measured with esbuild on a tree-shaken ESM bundle
(one import per library), not read off a README.

| | version · last release | licence | bundle (gzip) | renderer | a **card** with a wrapped title inside | edge label with a plate | badge per element | dashed by status | drag with a persistent place | edge routing | maintenance | cost of the switch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Cytoscape.js** *(incumbent)* | 3.34.4 · 2026-10-15 | MIT | **158 KB** with dagre | Canvas 2D | ◐ — native wrapping, but the card is **1–3 elements** | ✅ native | ❌ faked with an extra element | ✅ | ✅ | ❌ | 🟢 11.1 M dl/week, 6 maintainers | **0** |
| **d3 + a hand-written SVG painter** | d3 7.9.0 (2024) | ISC | **22.8 KB** | SVG you write | ✅ **one `<g>`** | ✅ | ✅ | ✅ | ✅ | ❌ | 🟢 d3 is stable; the risk is *our* code | 5–8 d |
| **AntV G6 v5** | 5.1.1 · 2026-04-17 | MIT | **393 KB** | Canvas / SVG / WebGL | ✅ the `html` node is real DOM | ✅ a shape | ✅ **native** | ✅ | ✅ | ✅ **`orth`** | 🟢 corporate | 5–8 d |
| **Sigma.js v4** | 4.0.3 · 2026-10-15 | MIT | 102 KB (+11 graphology) | WebGL2 | ❌ **single-line SDF text** | ✅ (new in v4) | ❌ | ✅ | ✅ | ❌ | 🟡 6 days old, a rewrite | 6–9 d |
| **Sigma.js v3** *(in the comparison today)* | 3.0.3 · 2024-04-30 | MIT | 26.7 KB | WebGL | ❌ needs a 2D overlay | ❌ (v3 has no edge labels) | ❌ | ✅ | ✅ | ❌ | 🟡 its satellite packages **404** | — |
| **vis-network** | 10.1.2 · 2026-08-19 | Apache-2.0 | 125 KB | Canvas 2D | ❌ the label sits **outside** the shape | ❌ | ❌ | ✅ | ✅ | ❌ | 🟡 351 open issues | 6–9 d |
| **d3 + a hand-written Canvas painter** | — | ISC | ~12–15 KB | Canvas you write | ⚠️ the wrapping by hand | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | — | 6–9 d |
| **PixiJS / deck.gl** | 8.22 / 9.4 | MIT | ~150 KB | WebGL2 | ❌ you draw everything | ❌ | ❌ | ✅ | ⚠️ | ❌ | 🟢 | 8–12 d |
| **ngraph.pixel** | 2.4.1 · **2017** | MIT | — | WebGL (three 0.73) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔴 dead | not viable |
| **Cosmograph** | 2.5.1 | ⚠️ **CC-BY-NC** | 191 KB | WebGL2 | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | 🔴 non-commercial, the domain is for sale | not viable |
| **Linkurious / yFiles / Graphistry / Bloom** | — | 🔒 **per seat** | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | vendor | a procurement decision, not a library decision |

### 3.2 The d3 ecosystem, and the exact reference

The product owner pointed at *"a force-directed layout of a tree using
hierarchy.links"*. That sentence is the description of an **Observable
notebook** (`@d3/force-directed-tree`), and its source is:

```js
const root = d3.hierarchy(data);
const links = root.links();
const nodes = root.descendants();
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(0).strength(1))
  .force('charge', d3.forceManyBody().strength(-50))
  .force('x', d3.forceX())
  .force('y', d3.forceY());
```

Three APIs are in there, and only two of them transfer:

| part | API | transfers to VozLab? |
| --- | --- | --- |
| the data | `d3.hierarchy` + `node.links()` | ❌ a **single-rooted tree**: no cycles, no multiple parents. VozLab's relation graph has both. |
| the layout | `d3.forceSimulation` + `forceLink` / `forceManyBody` | ✅ `forceLink` takes **any** list of links, cycles included. This is the transferable half, and it is **3 KB**. |
| the painting | hand-written SVG | ⚠️ it is the piece that decides the bundle — and the card |

The d3 modules, and what each is for:

| module | gzip | for | for VozLab |
| --- | --- | --- | --- |
| `d3-force` | 3.0 KB | the simulation | ✅ **the spring** |
| `d3-selection` | 4.3 KB | the DOM/SVG data joins | ✅ the painter |
| `d3-shape` | 7.7 KB | curve generators | ✅ the relations |
| `d3-drag` / `d3-zoom` | 1.8 / 3.4 KB | pointer and camera | ✅ |
| `d3-path` | 1.1 KB | serialises a path | ✅ |
| `d3-hierarchy` | 5.8 KB | `tree`, `cluster`, `stratify` | ❌ trees only |
| `d3-transition` | 3.8 KB | tweens the DOM | ⚠️ competes with Svelte 5's runes |
| the rest of the 30 | — | charts, maps, tiles | ❌ |

**And the negative result that matters: there is no serious "d3 + canvas"
graph renderer in 2026.** Every candidate found (`d3-graph-react`,
`polly-graph`, `netviz`, `nodino`) is a toy with single-digit weekly
downloads. `d3-dag` is serious but it is a *layout*. Everything serious that
draws graphs — Sigma, Cytoscape, G6, vis-network, force-graph — draws them
**without d3**, except AntV, which uses it as an internal dependency.

### 3.3 The finding that moves the decision

**Cytoscape cannot draw a card as one thing.** The repository works around
it today: every card is **1–3 separate Cytoscape elements** — the card,
the `#meta` line and the `#body` — positioned with `dx`/`dy` and
**re-synchronised on every frame of a drag**
(`apps/web/src/lib/graph/elements.ts`). A painter that owns the card as one
DOM subtree removes that debt, and the hard part is already renderer
independent: `apps/web/src/lib/graph/node-card.ts` (494 lines) and
`relation-card.ts` (307 lines) are **pure modules** — they know how to
wrap a Spanish title at word boundaries, how to size the card and how to
place a relation's card beside its line.

### 3.4 The measurement that settles "is SVG too heavy?"

Playwright + headless Chromium, 200 nodes / 400 relations, card = a
`<rect rx=8>` 140 px wide with a 4-line `<tspan>` title, a meta `<text>`,
a badge `<g>`, and edges as `<path>` + label + plate:

| | SVG (d3) | Canvas (Cytoscape) |
| --- | --- | --- |
| DOM elements for the whole graph | **4 007** | — |
| build time (create + attach) | **12.9 ms** | 114.1 ms |
| sustained fps during a 2 s pan | **59.7 fps** | 57.2 fps |
| the same at 1 000 nodes / 2 000 relations | 52.2 fps, 20 001 elements | 56.0 fps |
| updating every node's transform | 1.06 ms per pass | — |

**"SVG is too heavy for 200 cards" is false.** 4 007 DOM elements are not a
problem in a modern browser. Both renderers were vsync-capped, so the test
proves the SVG is not the bottleneck at 200–1 000 nodes; it does not locate
the crossover.

## 4. Part II — what arranges the graph

Measured on a synthetic 200-node / 400-relation graph with 140 × 60 cards:

| | time | deterministic | settles by itself | **overlapping card pairs** | bundle | licence | maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`d3-force`** + a rectangular collision | **443 ms** (300 ticks) | ✅ `randomSource(lcg)` | ✅ by `alpha` | **0**, with the collision written here | **3 KB** | ISC | 🟢 stable |
| `dagre` (via `cytoscape-dagre`) | 1262 ms | ✅ | ✅ one pass | ✅ | 17 KB | MIT | 🟢 the fork is alive |
| `d3-dag` (`quality: 'fast'`) | **138 ms** | ✅ | ✅ | ✅ | 46 KB | MIT | 🟢 |
| `d3-dag` (`quality: 'medium'`) | ⚠️ **90 153 ms** | ✅ | ✅ | ✅ | — | — | — |
| `elkjs` layered, orthogonal | 1111 ms | ✅ | ✅ | ✅ | **467 KB** | 🔴 EPL/GPL | 🟢 |
| `cytoscape-fcose` | 546 ms | ✅ with `randomize:false` | ✅ by `numIter` | ❌ **463 of 19 900** | 36 KB | MIT | 🔴 **Jan 2023** |
| `cytoscape-cola` | 3250 ms | ✅ | ✅ by energy | ✅ **0, guaranteed** | 29 KB | MIT | 🟡 |
| `graphology` force-atlas2 | 132 ms | only with fixed starts | ❌ **no convergence criterion at all** | ❌ | 5.5 KB | MIT | 🟡 |
| `@hpcc-js/wasm` (Graphviz) | ~1 s | ✅ | ✅ | ✅ | 637 KB | Apache-2.0 | 🟢 |

Three facts worth keeping:

- **A force layout has no collision of rectangles.** `fcose` left 463
  overlapping card pairs; multiplying its repulsion by eight moved the
  number to 458. The repulsion changes the *strength*, not the *shape* of
  the interaction. Only `cola` guarantees non-overlap, at 3250 ms and with
  a pathological extent (567 × 9 715 px).
- **Force-atlas2 has no area repulsion.** Its mass is `1 + weighted degree`
  and the node `size` is a *radius offset*, not an area. A card of 140 × 60
  and a card of 20 × 20 push each other with the same force.
- **The `d3-dag` quality presets have a cliff**: `fast` is 138 ms and
  `medium` took **90 seconds** on the same graph. If `d3-dag` is adopted,
  the preset must be pinned and the reason written down.

### 4.1 Edge routing

There is **no** small, maintained JavaScript library that routes edges
around rectangles. Cytoscape's `taxi`, `bezier` and `haystack` have **no
obstacle avoidance at all** (verified in its source: `haystack` is a
four-point polyline to a midpoint, and it is non-deterministic unless
`source`/`target` are set). The only real router in the whole candidate set
is **ELK layered with `edgeRouting: ORTHOGONAL` and ports** — 467 KB,
EPL-2.0/GPL-3.0, a second layout engine and its own worker.

The square-cornered shape was removed from the product in October 2026
because the product owner did not like it, and the hand-written router that
computed its turns went with it. **If the shape is ever wanted again, the
honest options are ELK or writing the router again** — there is nothing in
between.

## 5. The shortlist, and the order that makes sense

### 5.1 Already in place (roadmap 3.24)

**`d3-force` with a rectangular collision force** is the exploration
view's spring. It is a **pure module** (`apps/web/src/lib/graph/explore/
force-layout.ts`): no DOM, no canvas, no Cytoscape, with the frame
scheduler injected. It is deterministic (a seeded LCG and a fixed circular
start — two runs give *exactly* the same positions), it stops by itself
(`alpha < alphaMin`, 300 ticks), it is stepped in slices of three ticks per
frame so the reader sees the picture rearrange, and it charges the
repulsion by the **area** of the card. **Zero overlapping card pairs.**

What it does **not** yet do is the third clause of the use case: the
picture settles and stops, and the product owner wants it to stay **half
organised and still drifting**. That is an open item, not a done one.

### 5.2 The shortlist

| # | what | why it is on the list | cost | what it buys |
| --- | --- | --- | --- | --- |
| **1** | **The card as one object**, inside Cytoscape, using **compound nodes** | the cheapest way to remove the debt of the card being 1–3 elements with a per-frame sync | **1–2 d** | the text stops being a loose element with `dx`/`dy`; it becomes a child of the card, so it is out of the layout and out of the click targets |
| **2** | **A third painter in the comparison: d3 + SVG** | the comparison surface is precisely the place where a painter is chosen with the eyes; the pure card module already exists, and 3.24's layout is already painter-agnostic | 5–8 d, ~900–1 500 lines | the card as one `<g>`, the bundle at 23 KB instead of 158 KB, and the evidence of whether an SVG picture of cards is *pleasant* to read |
| **3** | **`d3-dag` as a clone of dagre** (roadmap 3.25) | it is nine times faster and it is the only d3-family layout that is serious and current | 2–4 d | a hierarchy that does not reverse the back-edges in silence — **and the finding that dagre does exactly that today** |
| **4** | **AntV G6 v5**, only if the yardstick changes | it is the most capable element-wise (native badge, native label plates, an `html` node that makes a card trivial, d3-force inside) | 5–8 d | everything native — at 393 KB and with an imperative framework that fights Svelte's runes |
| — | ~~Sigma.js~~ | **delete it from the comparison**: the card is impossible (single-line SDF text), and v4 is 102 KB against v3's 26.7 KB | — | — |
| — | ~~`cytoscape-fcose`~~ | it is the wrong incumbent for the force panel: dormant since January 2023 and it leaves the cards overlapping | — | — |

### 5.3 The order that follows from the use case

The use case asks for a picture that is **alive but structured**. That is
a *layout* property first and a *painter* property second: no painter makes
a hairball legible. So the order is:

1. **the layout** (items 1 and 3, then the living spring) — the picture has
   to have a shape before it is worth painting;
2. **the painter** (item 2, in the comparison) — the card as one object,
   judged with the eyes against the incumbent;
3. **the painter's decision**, only after the comparison says so.

## 6. The open findings this research produced

| finding | where | what it means |
| --- | --- | --- |
| **dagre reverses the back-edges in silence** | `dagre/lib/acyclic.js` | a cyclic relation is **drawn with the arrow against its meaning**, today, in production. It is a live bug, not a layout curiosity |
| the card is 1–3 Cytoscape elements with a per-frame sync | `apps/web/src/lib/graph/elements.ts` | the debt item 1 removes |
| `cytoscape-fcose` is dormant and overlaps the cards | npm, 2023-01-17 | it was the wrong incumbent for the force panel |
| `cytoscape-euler` exists (2026-05) and is **active**, in Cytoscape's own organisation | npm | a force layout inside the incumbent, if the exploration view's spring ever wants to go back to Cytoscape's own extensions |
| `cytoscape-d3-force` exists and is dormant (2020) | npm | its 350 lines are the recipe for an adapter; a VozLab-specific one is ~200 lines |
| Sigma v4 **adds edge labels** and **quadruples the bundle** | sigma's migration guide | the only new thing it brings is the one thing the card cannot use |
| the subgraph is **not a DAG** | the relation model | `d3-dag` must break the cycles, and must **show** it when it does |

## 7. How to measure these things honestly

- **Determinism**: run the layout twice from the same start and compare the
  **sorted `[id, x, y]` vectors exactly** — not with a tolerance. `fcose`
  with `randomize:false` measures a maximum delta of 0; with
  `randomize:true` the two runs differ.
- **Overlaps**: count the pairs where `|Δx| < (wA+wB)/2 && |Δy| < (hA+hB)/2`.
  This is the metric that exposed fcose's 463 and cola's 0.
- **Settling**: the stop semantics differ — `d3-force` stops by `alpha`,
  `fcose` by an iteration budget, `cola` by system energy, and
  **force-atlas2 has no criterion at all**, so "settled" there is a
  judgement call that must be stated rather than implied.
- **The frame time**: ask the picture to move — a wheel over the canvas —
  and record the time between the frames, one engine at a time, so the
  frame that is measured belongs to the engine under test.

## 8. Sources

The primary sources behind every number above: the npm registry API
(versions, dates, licences, unpacked sizes), the GitHub API (last commit,
releases, open issues), each project's own documentation and source, the
Observable notebook behind the product owner's reference, and the two
research passes of 2026-10-21 (the paint engines and the layout engines),
whose measurements were taken with esbuild on this repository's pnpm store
and with Playwright 1.64 and headless Chromium.

## 9. What has been built since

The shortlist is being worked through in the order §5.3 proposed. The
decisions of the product owner and the outcomes are recorded here so the
document does not age into a wish list.

| the research said | the board | the outcome |
| --- | --- | --- |
| the spring settles and stops; the ambition is a picture that keeps drifting | **3.26** | **done** — the living spring: an idle drift (`alphaTarget` 0.005 at ~12 Hz, 0.281 px per tick at 200 cards), a wake to 0.1 on contact with a 1.2 s cool-down, no ticks in a hidden tab, and a still picture under `prefers-reduced-motion`. The attraction is weighted by the relation's `communityScore`, which is what makes the picture *half organised*. |
| the card as one object, with compound nodes | ~~3.27~~ | **dropped** — a compound node is sized by its children (as `elements.ts` already documents) and the card is the one that must keep its shape. The goal is met by the painter below, where the card *is* one `<g>`. |
| a third painter: `d3` + SVG | **3.28** | **in progress** — the full candidate, with the same feature set as the incumbent. |
| `d3-dag` as a clone of dagre | **3.25** | **done** — 1.7 ms against dagre's 16 ms on the demo, and the finding: **dagre reverses 10 of the 35 arrows of the seeded demo in silence**. |
| delete Sigma and `cytoscape-fcose` | — | **done** — removed from the comparison, with their dependencies and their copy. |
| AntV G6 v5, only if the yardstick changes | — | **not built** — 393 KB and an imperative framework that fights the runes. |
| `cytoscape-euler` (2026-05) | — | **open** — the spring inside the incumbent; a candidate if the living spring ever wants to go back to Cytoscape's own extensions. |
