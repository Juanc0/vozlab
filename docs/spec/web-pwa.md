# Web PWA (`apps/web`)

> **Not implemented (Phase 3).** `apps/web/` contains only an empty `src/`
> directory: no `package.json`, SvelteKit app, Tailwind config, PWA plugin or
> tests. This page defines the intended frontend; nothing here runs today.

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
type WorkspaceSummary = { id: string; name: string; slug: string };

class WorkspaceState {
  currentWorkspaceId = $state('');
  workspaces = $state<WorkspaceSummary[]>([]);
  role = $state<'ADMIN' | 'MODERATOR' | 'MEMBER' | 'VIEWER'>('MEMBER');

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

  canEdit = $derived(this.role !== 'VIEWER');
}

export const workspaceState = new WorkspaceState();
```

The HTTP client reads the same key and injects:

```http
Authorization: Bearer <token>
X-Workspace-ID: <workspace uuid>
x-correlation-id: <uuid>
Content-Type: application/json
```

It should surface the API error envelope (`code`, `message`) rather than raw
HTTP text. A `401` clears the session; a `403 ERR_UNAUTHORIZED_WORKSPACE_ACCESS`
switches back to a permitted workspace. Token storage (memory vs.
`sessionStorage` vs. httpOnly cookie) is an open security decision.

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

- [ ] SvelteKit 5 + Tailwind builds and serves SSR.
- [ ] PWA manifest and service worker are generated; offline writes blocked.
- [ ] Workspace changes are isolated per tab via `sessionStorage`.
- [ ] `(app)` routes redirect to `/login` without a session.
- [ ] Cytoscape renders a bounded subgraph with `dagre` and cleans up.
- [ ] Proposals/discussions/votes use the real API, including optimistic vote
  rollback.
- [ ] No SSE; no placeholder that implies live updates.

## Open questions

- Token storage/refresh: keep the access token in memory and call
  `/api/v1/auth/refresh` on load (the API half exists; the PWA client is not
  built).
- SSE/event notification design (deferred) and offline cache scope.
- i18n/branding per tenant; graph performance beyond 200 nodes.

## Related

- [architecture.md](../architecture.md) — client/API topology.
- [api-reference.md](../api-reference.md) — endpoints and payloads.
- [auth-and-tenancy.md](../auth-and-tenancy.md) — JWT and workspace rules.
- [runbook-dev.md](../runbook-dev.md) — local token minting.
