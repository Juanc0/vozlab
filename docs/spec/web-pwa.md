# Web PWA (`apps/web`)

> **Partially implemented (Phase 3).** `apps/web/` is a working SvelteKit 5
> app: it builds, serves SSR and ships a PWA manifest and service worker
> (roadmap 3.1). The state layer, the route groups, the graph canvas, the
> governance UI, the offline shell and the E2E suite are still to come —
> 3.2 to 3.7. This page remains the normative spec for the whole phase.

## Stack

SvelteKit 5 with runes, TypeScript, Tailwind CSS, Cytoscape.js with the `dagre`
layout, and `vite-plugin-pwa` (Workbox + manifest). The PWA is the co-creation
client: graph exploration, proposals, discussions and votes. It is online-first;
offline mode is read-only.

## Routing

```text
apps/web/src/routes/
├── (auth)/
│   ├── login/+page.svelte        # institutional SSO entry (FR-01)
│   └── join/+page.svelte         # event/QR session (FR-03)
├── auth/callback/+page.svelte    # OIDC failure landing (outside the groups)
└── (app)/
    ├── +layout.svelte            # session guard, sidebar, workspace selector
    ├── +page.svelte              # graph canvas
    ├── proposals/+page.svelte    # knowledge pull requests
    └── discussions/+page.svelte  # threads and comments
```

`(app)` redirects to `/login` when no session is available. The URL stays
clean (`/`); the active workspace is **not** a path segment (FR-04).
Notifications over SSE are **not implemented**; the layout must not pretend a
live stream exists.

### Corrections against the code

- **The login and join pages are real.** The endpoints exist (Batch 1V):
  `GET /api/v1/auth/login` starts the OIDC redirect, `POST
  /api/v1/auth/event-join` consumes an event code, `POST /api/v1/auth/refresh`
  exchanges the `HttpOnly` cookie for an access token and `GET
  /api/v1/auth/me` returns the memberships. Local development without an
  IdP uses the **event-code join**, not a minted JWT: `db:event-code` issues
  a code and `/join` consumes it. A minted token has no refresh cookie and
  cannot open a session in the app.
- **`/auth/callback` is outside both groups.** The API redirects an OIDC
  failure to `${WEB_ORIGIN}/auth/callback?error=CODE`. That path cannot live
  inside `(auth)` — a group adds no path prefix, so it would serve
  `/callback` — and it must not be swallowed by `(app)`, whose guard would
  redirect it back to the login.
- **The guard has four states, not two.** `restoring` (the session is being
  restored in the browser, and the server renders exactly this state so the
  first client render matches), `ready`, `no-membership` (a valid session
  with no workspace — an explicit state, never a redirect loop) and
  `failed` (the API could not be reached — an explicit error, never
  masquerading as a missing session).
- **A 403 `ERR_UNAUTHORIZED_WORKSPACE_ACCESS` needs a seam.** The workspace
  state can switch to another permitted workspace, but when none is left the
  caller must send the user back to `/login`. The first batch that fetches
  graph data owns that path.

## Per-tab workspace state

`sessionStorage` is per tab, which is exactly the isolation FR-04 requires:
switching workspace in one tab must not affect another. Do not use
`localStorage` for the workspace.

The old docs contain an invalid type (`Array<{ id: name: slug: string string; }>`).
The corrected shape is:

```ts
// `WorkspaceSummaryDto` and `WorkspaceRole` come from
// `@vozlab/shared-types` — do not restate them here.
type WorkspaceSummary = WorkspaceSummaryDto; // { id, slug, name, role }

class WorkspaceState {
  currentWorkspaceId = $state('');
  workspaces = $state<WorkspaceSummary[]>([]);
  role = $state<WorkspaceRole>('MEMBER');

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentWorkspaceId =
        sessionStorage.getItem('vozlab_active_workspace') ?? '';
    }
  }

  setWorkspace(id: string) {
    this.currentWorkspaceId = id;
    sessionStorage.setItem('vozlab_active_workspace', id);
  }

  isModerator = $derived(isModeratorOrAdmin(this.role));
}
```

Three corrections, made against the code rather than the older draft:

- **There is no `VIEWER` role.** The workspace roles are `ADMIN | MODERATOR |
  MEMBER` (`WorkspaceRoleSchema` in `@vozlab/shared-types`, enforced by the
  tenant schema). There is no `canEdit`: every membership role may create
  nodes, edges, proposals and votes. Only the *resolution* actions are
  restricted — approve/reject to the target's maintainer, auto-apply to
  `MODERATOR`/`ADMIN` — and the API re-checks them regardless of the UI.
- **The role is derived from the active membership**, not an independent
  field: `WorkspaceSummaryDto` carries the role, and the state picks the one
  of the active workspace.
- **The state is not a module-level singleton.** `export const workspaceState =
  new WorkspaceState()` leaks one user's workspace into another user's SSR
  request. The root layout creates the instance and provides it through
  Svelte's context API; every child reads it with `getContext`.

The HTTP client reads the same key and injects:

```http
Authorization: Bearer <token>
X-Workspace-ID: <workspace uuid>
x-correlation-id: <uuid>
Content-Type: application/json
```

`Content-Type` is only sent when the request carries a body.
`GET /api/v1/auth/me` is the one Bearer-protected route that takes **no**
`X-Workspace-ID`: the workspace is the answer, not an input.

It should surface the API error envelope (`code`, `message`) rather than raw
HTTP text. A `401` clears the session; a `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`
switches back to a permitted workspace.

**Token storage is decided, not open.** The access JWT is returned in the JSON
body of `/auth/refresh` and kept **in memory only**; the refresh token is an
opaque `HttpOnly` cookie scoped to `/api/v1/auth` and rotated on every
refresh, so JavaScript never sees it. Neither credential is written to
`localStorage` or `sessionStorage`. The only persisted value is the active
workspace id.

The one exception is the **development sign-in**: a locally minted token has
no refresh cookie behind it, so without a way to keep it a reload would
silently fall back to whatever session the cookie holds. It is kept in
`sessionStorage`, per tab, and only in a development build — the check that
keeps it out of a production bundle is `isDevelopmentBuild()`. Nothing about
the production path changes.

### The refresh must be serialised

The refresh cookie is shared by every tab of the origin, while the access
token is per tab. The API rotates the cookie on every refresh and treats the
presentation of an already-rotated token as **reuse**, which revokes the
whole family. Two tabs restoring their session at the same time would
therefore both be logged out.

Multi-tab is not an edge case: FR-04 requires the workspace to be isolated
*per tab*, which only makes sense if a user runs several tabs. The client
serialises the refresh:

- **across tabs**, with the origin-scoped Web Locks API — the loser waits and
  then reads the *rotated* cookie out of the shared jar;
- **within a tab**, by sharing the in-flight promise. That state lives on the
  `ApiClient` instance, not in a module global, so two clients never wait on
  each other.

The server-side alternative — a grace window that returns the same successor
token for a reuse inside it — is the API's decision: it would weaken the
theft detection.

## The language of the interface

The interface speaks **Spanish by default** and English as the second
language. The preference lives in the cookie `vozlab_locale`, never in
`localStorage` or `sessionStorage`.

- `es.ts` is the **source of truth**: it holds the dictionary as a nested
  `as const` object, and its dotted paths are the `TranslationKey` union, so
  `t('loginn.title')` does not compile.
- `en.ts` is declared as `Dictionary<typeof es>`, which widens every string
  leaf and recurses into the objects. A missing key, a misspelled key and a
  leftover key are all **compile errors**. The two dictionaries cannot drift.
- The state is a runes class provided through the **context API**, not a
  module singleton — a singleton would leak one visitor's language into
  another's SSR request.
- The server renders the right language: a `handle` hook rewrites the
  `<html lang>` of the document from the cookie, and the root layout reads
  the same cookie to seed the state. The first client render therefore
  matches the server — no hydration mismatch, no flash of the wrong
  language.
- Changing the language updates the state, the `lang` attribute and the
  cookie **without a reload**: the session lives in memory, and a reload
  would cost the user their sign-in.
- The selector's options are written in their own language ("Español",
  "English"), so a person who does not read the current language still finds
  theirs.
- Dates and numbers follow the locale through `Intl`.

The **seeded content is Spanish**: it is data, not interface copy. The
ontology's `displayNames` are locale maps, so the class and property names
follow the interface's language, and the seed carries both.

The API's error `code` values are contract identifiers and stay in English.
The API's error `message` is the API's own copy and also stays as it is;
the messages the web app owns are translated.

## Graph canvas

`GraphCanvas.svelte` initializes Cytoscape once, updates elements when props
change, and destroys the instance on unmount. Render bounded subgraphs only
(API limit: 200 nodes), with a deterministic `dagre` layout — no continuous
physics.

```svelte
<script lang="ts">
  import cytoscape from 'cytoscape';
  import dagre from 'cytoscape-dagre';
  import type { NodeDto, EdgeDto } from '$lib/api/types';

  let { nodes, edges } = $props<{ nodes: NodeDto[]; edges: EdgeDto[] }>();
  let container: HTMLDivElement;

  $effect(() => {
    cytoscape.use(dagre);
    const cy = cytoscape({
      container,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.id, label: n.title } })),
        ...edges.map((e) => ({ data: { id: e.id, source: e.sourceNodeId, target: e.targetNodeId } }))
      ],
      layout: { name: 'dagre' }
    });
    return () => cy.destroy();
  });
</script>

<div bind:this={container} class="h-full w-full"></div>
```

### Corrections against the code

**The snippet above is wrong in two ways.** It is kept only to show what must
not be done.

- The effect reads `nodes` and `edges`, so it re-runs — and re-creates the
  whole instance — whenever they change. The instance must be created by one
  effect that depends on nothing but the container, and the elements must be
  patched by a *separate* effect (`cy.elements().remove()` then `cy.add()`).
- `cytoscape.use(dagre)` re-registers the extension on every run. It belongs
  at module level, once.

The instance is also held in `$state.raw`, so Svelte does not wrap the opaque
Cytoscape object in a reactive proxy, and the module is imported **inside**
the effect, so the SSR pass never evaluates Cytoscape at all.

**The canvas needs a text alternative.** Cytoscape draws to a `<canvas>`,
which a screen reader cannot see. The subgraph is therefore also rendered as
two real tables — the nodes and the relations — with captions, column
headers and row headers, and the two views share one selection. The canvas
itself carries `role="img"` and a short description of what it shows, for
the case where the list is collapsed.

**The subgraph edges are narrower than `EdgeDto`.** The API returns
`{ id, sourceNodeId, targetNodeId, relationKey, status, communityScore }` —
the topology and the score, not the attributes, the author or the
timestamps. That shape is `SubgraphEdgeDto` in `@vozlab/shared-types`; the
canvas must not expect a full edge. The score is there so the canvas can
vote on a relation without a second read.

Selecting a node opens details and its edit-proposal history. The history is
filtered **client-side**: the API's proposal list accepts `status`,
`targetType`, `kind`, `limit` and `cursor`, but no `targetId`. The UI says
so when the page was truncated — the history is partial, and pretending
otherwise would be a lie.

Edges are styled by relation key/status. Empty and error states are
explicit; a failed fetch must not leave a blank canvas.

Edges are styled by relation key/status. Empty and error states are
explicit; a failed fetch must not leave a blank canvas.

## The layout

The base styles are the **phone's**; the breakpoints add the columns. Not
the other way round.

- Below `md` the navigation is a **drawer** that opens from the left over
  the content, with a backdrop, a focus trap, <kbd>Escape</kbd> and the
  focus returned to the opener. There is **no bar of the shell**: the
  product's mark and name live in the navigation column, and the button
  that opens the drawer floats in the corner of the content, announcing
  its state.
- Below `xl` the inspector is a **sheet** that slides in from the right.
  It must not be the last thing in the page: a column that stacks below
  everything is a column nobody finds.
- Both are the **same implementation** — one panel over the content, two
  directions — and the focus trap is the app's, extracted from
  `ModalDialog` rather than written twice.
- The canvas is a fraction of the **visual** viewport (`svh`/`dvh`), not of
  `vh`: the chrome of a mobile browser changes the height of `vh`.
- No horizontal scroll at 320 px. The tables scroll inside their own
  container, never the page.
- The touch targets are at least 44 × 44 px on a touch device — the hit
  area of a canvas badge grows while the dot stays small.

**The canvas follows the window.** A `ResizeObserver` on the container calls
`cy.resize()` and **nothing else**: no `fit()`, no layout. Cytoscape's
`resize()` redraws the surface and keeps the zoom and the pan, so the
picture stays exactly where the reader left it. A resize that re-fits moves
the graph under the reader's feet. The observer is disconnected with the
instance.

## The inspector

One right-hand column, shared by **both** graph views, with four tabs:
**Contenido** (the content and the properties of the selected thing, with
the vote buttons), **Atributos** (the attributes, and the actions),
**Propuestas** (the proposals of the target) and **Foro** (the threads and
the posts). The inline detail panel of the subgraph view is gone; the
inspector's first tab replaces it.

The selection is a **node or a relation** — the canvas selects nodes, the
list view selects both — and a relation is read with
`GET /api/v1/edges/:id`, because the subgraph's edge is the topology only.

The actions express an asymmetry of the API that the interface must show
rather than hide:

- a **relation** can be edited **directly** with `PATCH /api/v1/edges/:id`,
  and **only its author** may: anybody else gets
  `403 ERR_AUTHORIZATION_FAILED`;
- a **node** has **no** direct edit route at all — the only way to change it
  is to propose a correction, and the **author of the target** decides.

So the direct edit appears for a relation the signed-in user authored, and
where it is not available the interface says **why** rather than showing a
dead button.

The proposals of a target are filtered **client-side**: the API's proposal
list takes `status`, `targetType`, `kind`, `limit` and `cursor`, but no
`targetId`. The interface says when the page was truncated — the history is
partial, and pretending otherwise would be a lie.

## The names are in the interface's language

The ontology carries a **map** of display names per thing
(`{"en": "Problem", "es": "Problema"}`), and the **API returns that map** —
the client picks the language it wants. The API does not negotiate one: a
workspace may have ten languages and the client may be in any of them, and
the API has no business knowing which.

- `NodeDto.typeDisplayNames` — the class's names.
- `SubgraphEdgeDto.relationDisplayNames` and `EdgeDto.relationDisplayNames`
  — the relation's names.
- A missing map is `{}` — a `PROPOSED` class, or a key with no row — and the
  client falls back to the key. A class of another workspace is never in
  the answer.

The client picks with a **fallback chain**: the exact locale, then its base
language, then the key of the system.

The **statuses** are a *vocabulary*, not copy: a map per scope, typed with
`satisfies Record<NodeStatus, string>`, so a status added to the shared
vocabulary without a label in one of the languages is a **compile error**.
The interface reads them through the state's `status(scope, value)`, which
falls back to the raw value for an unknown one.

The API's error `code` is a contract identifier and stays in English; the
API's `message` is the API's own copy and stays as it is.

## The zoom is the reader's

The zoom is **a property of the view**, and the reader owns it.

- When the view opens, the picture is **fitted once**: every node of the
  window is inside the canvas's box. The old clamp that forced a minimum
  zoom of 0.75 — so that a card whose title could not be read was never
  drawn — is **gone**: at the fit the titles are small, and the reader is
  the one who decides whether to zoom in to read.
- The **wheel** changes it, within a range of 0.05 to 3. The value is
  `null` until the reader chooses one, and a view that opens without a
  choice fits its own picture.
- **Walking never changes it.** A layout that only reshapes the picture
  keeps the reader's zoom.
- It survives switching between the *Subgrafo* and the *Explorar* modes —
  they are the same workspace — and starts again at the fit when the page
  is opened afresh.

## Walking re-centres, smoothly

Clicking a node re-requests the subgraph rooted at it and the view ends up
**centred on that node**, with an **animated pan** (320 ms, eased) that
carries **no zoom**, so it cannot change the value by accident.

**The spring settles first and then the view glides.** The node's final
place is only known when the simulation stops: a pan towards a moving
target would have to be re-targeted on every frame, which is a fight, and
it would land short.

With `prefers-reduced-motion` the pan is **instant**.

## Nothing that has been seen is taken off the picture

The exploration view shows the **whole working set** — the window it
started from plus every neighbourhood walked to. There is no control that
hides the far nodes: what is on the picture stays on the picture, and the
counts in the interface say the truth about it.

## The spring of the exploration view

The exploration view is arranged by **`d3-force`**, and the collision that
no library does for cards is written here.

- **Deterministic**: a seeded LCG and a fixed circular start. Two runs
  give **exactly** the same positions.
- **A one-pass run stops by itself**: `alpha < alphaMin`, in 300 ticks —
  that is the reduced-motion path. The living spring of the exploration
  view **never comes to rest by itself**.
- **It is stepped in slices** of three ticks per frame, so the reader sees
  the picture rearrange — the spring is the point — and the interface never
  stalls. `prefers-reduced-motion` runs it in one go, to the same picture.
- **The collision is rectangular**: two cards that overlap are pushed apart
  along the axis of least penetration, symmetrically, and a card the reader
  dragged never moves. The neighbours come from a **uniform grid** (1.0 ms
  per tick at 200 nodes, 6.2 ms at 1000).
- **The repulsion is charged by the area** of the card, not by its degree:
  force-atlas2 scales the mass by the weighted degree, which lets a small
  card dominate the picture.

The layout is a **pure module** — no DOM, no canvas, no Cytoscape — so it
is unit-tested on its own and it survives a change of painter.

**The ambition, met.** The picture is **alive but structured**: the
clusters stay legible and the cards keep drifting between them.

- **The idle breath**: the arrangement the spring gave the cards is held,
  and every card **sways** around its place on a small circle of its own —
  radius 5 model px, a full circle every six seconds — as an **offset of
  the positions**, not as a force: the fit, the collision and the centre
  of a card the reader clicks never walk. The idle spring ticks at ~20 Hz
  (0.890 ms per tick at 200 cards); the sway is what the reader sees, and
  the wake ticks three times per frame, so the breath is livelier under
  the pointer.
- **It never stops while the picture is on screen.** A living spring is not
  capped by the tick count of a one-pass run (that cap is a freeze in
  disguise) and it never reports itself settled: it ticks on until the
  caller stops it.
- **The repulsion has a reach**: 900 model px. A charge without a reach
  pushes a card that hangs from a single relation out of the picture
  forever — the picture grows a few pixels a second and the fit erodes.
  With the reach cut, the arrangement stays inside its fit.
- **The fit of the view is taken from the picture the spring arrives at**:
  the same arrangement is run in one go, at the alpha of the awake spring
  (400 ticks), before the first frame. A fit taken from the frames of the
  animation is a fit around a smaller picture, and the cards of the edge
  walk out of the box as the arrangement settles.
- **The wake**: `alphaTarget` 0.1 while the reader is in contact with the
  picture (a pointer moving over the canvas, a card grabbed, a card
  hovered, a node focused, a walk, a zoom), cooling back to the idle
  breath in **1.2 s** after the last contact. A dragged card is pinned, its
  neighbours part and re-accommodate, and on release the card keeps its
  place.
- **The attraction is weighted by the relation's `communityScore`**: a
  strong relation pulls its cards closer than a weak one, so the clusters
  grow around the strong relations. Without a score the attraction is
  uniform.
- **A hidden tab stops the driver** (`visibilitychange`) and coming back
  resumes it where it was. A panel that is no longer shown **destroys** its
  spring — the comparison unmounts the previous engine, the graph page
  unmounts the canvas on a route change — so nothing ticks off screen.
- **`prefers-reduced-motion`**: the picture runs to rest and does not
  drift. That reader gets a still picture, which is the correct behaviour
  and not a degradation.
- **The shape is reached, it is not "settled"**: the walk waits for the
  wake's movement to fall below the threshold (or a deadline of 900 ms)
  and then glides. The readout says **"Viva: se mueve en reposo"**, never
  "asentada"; the idle drift never re-triggers a pan.

`cytoscape-fcose` and force-atlas2 are **no longer in the comparison** —
the research's verdict: dormant since 2023 and unable to draw the card.

The measured comparison, on 200 nodes and 400 relations:

| layout | time to settle | overlapping card pairs | reproducible |
| --- | --- | --- | --- |
| `dagre` | 2971 ms | 0 | yes |
| **`d3-force`** | **386 ms** | **0** | yes, fixed seed |
| `cytoscape-fcose` | 1052 ms | **392** | yes, with `randomize:false` |
| force-atlas2 | 5640 ms | **493** | only with fixed starts — and **no convergence criterion at all** |

## The workspace

The graph page is a **workspace**, not a page: it fills the viewport
(`100dvh`, the visual viewport — the mobile browser's chrome changes the
height of `vh`), and **the page does not scroll**.

The canvas is that whole area, on an **even ground** — `--color-ground`,
with no grid, no dots and no texture. An even surface is the point; the
house rules ban grids and crosshairs.

The **panels float over the canvas**: the toolbar with the title, the mode
switch and the controls at the top, the inspector on the right. A floating
panel is the one thing the design system allows a shadow on — it truly
floats — and it is a **solid** surface: no glass, no backdrop blur. It has
a border, because the canvas behind it is the same ground and a tone step
cannot separate them. The panels are `absolute`, so **opening one does not
resize the canvas**, and the canvas still follows the window.

The **app's** navigation stays a column: the panels that float are the
workspace's, not the app's.

The **list view** is the canvas's text alternative and it is the other half
of the same area — the toolbar's toggle swaps the picture for the list and
back, the canvas stays mounted (its zoom and its pan survive) and is
`inert` and `aria-hidden` behind it. The alternative is never hidden behind
a hover or a gesture.

## Walking the graph

Clicking a node in the canvas is a **walk**: one request per click to the
subgraph **rooted at that node**, at the depth already selected.

- The **exploration** view **merges** the answer into its working set: the
  nodes accumulate, so walking never loses what was already seen.
- The **subgraph** view **re-roots**: a neighbourhood has a root, and the
  root picker and the canvas now agree.
- The picture **never empties** while the request is in flight. The old one
  stays until the new one is ready, the region is `aria-busy` and a polite
  live region says what is happening. A failure keeps the picture and
  shows the `code` and the `message`; a node with no relations is a note,
  not an error.
- A click switches the focus criterion to *the one the user chose*, so the
  view does not re-present another node under the reader's hand.
- Whether the **far nodes** stay on the picture is the reader's choice: a
  switch between the whole working set and only the focus's neighbourhood
  at the current depth, with the counts in the interface being the truth.
- The **list view** carries a *walk* button per row: the canvas is not
  reachable by keyboard, and the text alternative is the keyboard's path.

## The node is a card

Every node of the canvas is a **card**, not a dot:

- a white rectangle with the sheet's 8px radius, **no edge and no shadow**,
  on the canvas's `--color-ground` — the card is separated from its
  background by a **tone step**, the same way the sheet's cards are;
- the **title is inside it**, wrapped greedily at word boundaries, and
  **a word is never broken**: a word wider than the card widens the card;
- the card's **height grows** with the number of lines, and the meta line
  under the title carries the node's **type** in the ontology's own
  language;
- the **status is a mark, not a fill**: `ACTIVE` wears nothing at all, and
  the other statuses wear a 2px border in their colour. The card is a
  surface, so it is never painted with a state;
- the **selection** wears the accent's ring and its pale underlay; the
  **presented** node wears the ink's ring. The two rings are the view's,
  not the data's, and neither is confused with a status mark.

The wrapping is a **pure module** (`$lib/graph/node-card.ts`) with the text
measurer **injected**, so it is tested with a deterministic measurer. The
browser measures with the canvas, after the face is loaded, and falls back
to an estimate that over-measures by about a fifth — the safe direction,
because a card a little too tall reads and a card too short spills.

The canvas **follows the window** (`ResizeObserver` → `cy.resize()`, and
nothing else: no re-fit, no layout), so the picture stays where the reader
left it.

## The exploration view

A second mode of the graph page — "Subgrafo" / "Explorar" — that draws the
workspace as a **landscape** instead of a neighbourhood. It reads
`GET /api/v1/nodes/window`: the most recent nodes of the workspace and the
relations among them.

Three things about the window are not what the subgraph is, and the interface
says so: it is a **closed graph** (a relation whose other endpoint is
outside it is not in the answer, so a node at the border may look isolated
while it has many relations outside), its order is a **creation** order and
not an activity one, and it is **bounded** with no pagination.

**There is no root.** The subgraph is rooted at a node the user picks; the
exploration view *presents* one, and the criterion is a control: the most
recently added node, the node with the most relations in the window, or the
node the user last clicked. The presented node is expanded and the view
centres on it.

**Three different things, kept apart.** The **focus** is what the view
presents. The **preview** is transient: pointing at a node or a relation
opens a panel with its content and it closes with the pointer. The
**expansion** changes the picture: a badge on the node toggles it between a
dot and a card carrying its whole content, and the layout is recomputed so
the nodes rearrange around the new size, with the spacing growing with the
number of expanded cards. The layout stays deterministic — no physics.

**A node can be dragged** to another place among the others; the position
is temporary and the node **keeps it** when the layout is recomputed, which
is why the pinning goes through the layout's `transform` hook and not
through its `position` option — `cytoscape-dagre` does not read the latter.

**The shape of the relations is a choice**: a single line and four curves —
the smooth one, the open one, the wide arc and the haystack.

**There is no route with right angles.** The shape was in the interface and
the user did not like it: the square corners read as a diagram of pipes
rather than as the relations of a knowledge graph, and a relation that turns
at right angles draws the eye to the turn instead of to what it joins. The
shape is gone from both graphs, and the pure router that computed the turn
is gone with it: no shape is routed any more, so every one of them is a
curve and nothing more.

Two corrections against the code of Cytoscape, verified against its
sources: it has **no `controlPoints` field** and **no `curve-style:
'arc'`**. The "arc" is therefore a wide bezier, and the curve styles that
are left are `straight`, `bezier`, `unbundled-bezier` and `haystack`.

## Governance UI

The correction form is built from the **whitelist the API applies**: a node
accepts `title`, `description` and `attributes`; a relation accepts
`relationKey` and `attributes`. A field the API ignores would be a proposal
that silently does nothing, so the form does not offer one. Only the fields
that actually change go into the delta — a proposal must not claim a change
that is not one — and the attributes are coerced to the type the user
declared.

The attributes are **merged** into the target's own: the delta wins for the
keys it carries (`Node.updateAttributes` is `{...attributes, ...delta}`).
That is the rule of an edit; the rule of a *merge* is the opposite — the
survivor's own values win ([ADR-0026](decisions/ADR-0026-merge-contract.md)).
The API can neither remove nor rename an attribute, so the form cannot offer
it either: the key of an existing attribute is read-only and emptying it is
refused with an explicit message.


| Screen | Behavior |
| --- | --- |
| Node details | Title, description, ontology attributes, author pseudonym, status, score. |
| Proposals | List/filter by status; open a proposal to see the delta and discussion. |
| Corrections | Propose a correction of a node or a relation: the delta shows the current and the proposed value, and only the fields that really change are sent. |
| Discussions | Threaded posts, replies, close-thread action for the creator. |
| Voting | Upvote/downvote on proposals, posts and relationships. The relations of the subgraph carry their score, so the canvas votes on a relation without a second read. |

Voting is **optimistic**: update the local score immediately, send
`POST /api/v1/interactions`, and roll back on error with a visible message. The
server remains authoritative and enforces one active vote per user/target.

Approval controls are shown only to the target's maintainer; moderators see
auto-apply only when the server-side criteria are met. Do not infer permissions
from the UI alone: the API re-checks every action.

## PWA behavior

Minimal manifest:

```json
{
  "name": "VozLab",
  "short_name": "VozLab",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#1e3a8a",
  "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

- `vite-plugin-pwa` generates the manifest and service worker.
- Workbox precaches the app shell, assets, CSS and fonts.
- Offline: reads may use cached data; **writes are blocked** with a clear
  banner. No background sync of mutations.
- A new service-worker version prompts the user to reload; do not silently
  swap assets mid-session.

### Corrections against the code (3.6)

**`navigateFallback` cannot be used with an SSR SvelteKit app.** Workbox
binds it to `createHandlerBoundToURL(...)`, and `PrecacheController
.createHandlerBoundToURL` replaces the request with the precached URL and
returns it **unconditionally** — so it would answer *every* navigation with
the fallback and replace every server-rendered page. The offline navigation
is a Workbox `NetworkFirst` route with `PrecacheFallbackPlugin`, whose
fallback is a real static document (`static/offline.html`) that is in the
precache manifest.

**The write block happens in the client, before the request.** The API client
is the only place a request is issued, so it refuses a non-`GET` when the
browser is offline and throws a client-side `OfflineError`
(`ERR_OFFLINE` — the API never answered, so there is no API code). The
optimistic vote is the one special case: it checks the connectivity
**before** it moves the score, so a refused vote is never optimistic and
never rolls back.

**The install control only exists when the browser offered one.**
`beforeinstallprompt` never fires in Firefox and Safari, so the control is
rendered only after the event was captured — there is no dead button. The
same type of rule applies to the update prompt: the waiting worker is
applied only when the user accepts it.

## Phase 3 acceptance criteria

- [x] SvelteKit 5 + Tailwind builds and serves SSR. *(3.1 — `pnpm --filter
  @vozlab/web build`, adapter-node, verified with `curl` against the built
  server.)*
- [x] PWA manifest and service worker are generated; offline writes blocked.
  *(3.1 generates the manifest and the worker in `prompt` mode; 3.6 adds the
  offline document, the offline banner and the write block.)*
- [x] Workspace changes are isolated per tab via `sessionStorage`.
- [x] `(app)` routes redirect to `/login` without a session. *(3.3 — four
  guard states: `restoring`, `ready`, `no-membership`, `failed`.)*
- [x] Cytoscape renders a bounded subgraph with `dagre` and cleans up. *(3.4 —
  the instance is created once, the elements are patched on a change and the
  instance is destroyed on unmount; `dagre` is registered once at module
  level and the layout is deterministic, with no physics.)*
- [x] Proposals/discussions/votes use the real API, including optimistic vote
  rollback. *(3.5 — the score moves before the request leaves and a refusal
  restores the exact previous value; the server stays the authority and the
  score is read back after a counted vote.)*
- [x] No SSE; no placeholder that implies live updates. *(Asserted by a test
  on the graph page: no polling, no auto-refresh, no "live" wording.)*

## Open questions

- SSE/event notification design (deferred) and offline cache scope.
- i18n/branding per tenant; graph performance beyond 200 nodes.

## Related

- [architecture.md](../architecture.md) — client/API topology.
- [api-reference.md](../api-reference.md) — endpoints and payloads.
- [auth-and-tenancy.md](../auth-and-tenancy.md) — JWT and workspace rules.
- [runbook-dev.md](../runbook-dev.md) — local token minting.
