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

## Governance UI

| Screen | Behavior |
| --- | --- |
| Node details | Title, description, ontology attributes, author pseudonym, status, score. |
| Proposals | List/filter by status; open a proposal to see the delta and discussion. |
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
