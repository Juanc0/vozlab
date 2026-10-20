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
│   ├── login/+page.svelte        # institutional SSO entry (FR-01, not built)
│   └── join/+page.svelte         # QR/event session (FR-03, not built)
└── (app)/
    ├── +layout.svelte            # session guard, sidebar, workspace selector
    ├── +page.svelte              # graph canvas
    ├── proposals/+page.svelte    # knowledge pull requests
    └── discussions/+page.svelte  # threads and comments
```

`(app)` redirects to `/login` when no session/workspace is available. Until
FR-01/02/03 endpoints exist, development uses a manually minted JWT from
`db:mint-token`; the login/join pages are placeholders.

The URL stays clean (`/`); the active workspace is **not** a path segment
(FR-04). Notifications over SSE are **not implemented**; the layout must not
pretend a live stream exists.

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

Selecting a node opens details and its edit-proposal history. Edges are styled
by relation key/status. Empty and error states are explicit; a failed fetch must
not leave a blank canvas.

## Governance UI

| Screen | Behavior |
| --- | --- |
| Node details | Title, description, ontology attributes, author pseudonym, status, score. |
| Proposals | List/filter by status; open a proposal to see the delta and discussion. |
| Discussions | Threaded posts, replies, close-thread action for the creator. |
| Voting | Upvote/downvote on proposals, posts and relationships. |

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

## Phase 3 acceptance criteria

- [x] SvelteKit 5 + Tailwind builds and serves SSR. *(3.1 — `pnpm --filter
  @vozlab/web build`, adapter-node, verified with `curl` against the built
  server.)*
- [ ] PWA manifest and service worker are generated; offline writes blocked.
  *(3.1 generates the manifest and the worker in `prompt` mode; the offline
  shell and the write block are 3.6.)*
- [ ] Workspace changes are isolated per tab via `sessionStorage`.
- [ ] `(app)` routes redirect to `/login` without a session.
- [ ] Cytoscape renders a bounded subgraph with `dagre` and cleans up.
- [ ] Proposals/discussions/votes use the real API, including optimistic vote
  rollback.
- [ ] No SSE; no placeholder that implies live updates.

## Open questions

- SSE/event notification design (deferred) and offline cache scope.
- i18n/branding per tenant; graph performance beyond 200 nodes.

## Related

- [architecture.md](../architecture.md) — client/API topology.
- [api-reference.md](../api-reference.md) — endpoints and payloads.
- [auth-and-tenancy.md](../auth-and-tenancy.md) — JWT and workspace rules.
- [runbook-dev.md](../runbook-dev.md) — local token minting.
