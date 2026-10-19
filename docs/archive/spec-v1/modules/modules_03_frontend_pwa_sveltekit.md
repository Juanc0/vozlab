---
title: "Module Specification: Frontend PWA, SvelteKit 5 Runes and Cytoscape.js"
version: 1.0.0
status: APPROVED
target_component: Frontend PWA (SvelteKit 5)
owner: Frontend & UX Team (VozLab)
---

# 03. FRONTEND PWA, SVELTEKIT 5 RUNES AND GRAPH VISUALIZATION

## 1. UI Architecture and Routing (Group Layouts)

The VozLab PWA is organized using SvelteKit 5 **Group Layouts** to separate public and authentication access from the protected graph and co-creation views, keeping clean, institutional URLs (`app.vozlab.io/`).


```

apps/web/src/routes/
├── (app)/                           <-- PROTECTED GROUP (Requires an active session and Workspace)
│   ├── +layout.svelte               <-- Layout with sidebar, Workspace selector and SSE notifications
│   ├── +page.svelte                 <-- MAIN VIEW: Interactive Graph visualizer (Cytoscape.js)
│   ├── discussions/
│   │   └── +page.svelte             <-- Debate threads and granular comments
│   └── proposals/
│       └── +page.svelte             <-- Panel of Pull Requests and Ontological Proposals
│
└── (auth)/                          <-- PUBLIC GROUP
├── login/
│   └── +page.svelte             <-- Institutional SSO OIDC Gateway
└── join/
└── +page.svelte             <-- Entry via QR Code / ephemeral event session

```

---

## 2. Global State Management with Svelte 5 Runes (`$state`)

The use of traditional global stores is eliminated in favor of typed state classes with Svelte 5 reactivity primitives (`$state`, `$derived`, `$effect`):

```typescript
// apps/web/src/lib/state/workspace.svelte.ts
class WorkspaceState {
  currentWorkspaceId = $state<string>('');
  workspaces = $state<Array<{ id: name: slug: string string; }>>([]);
  
  constructor() {
    // Safe initialization from sessionStorage per tab
    if (typeof window !== 'undefined') {
      this.currentWorkspaceId = sessionStorage.getItem('vozlab_active_workspace') || '';
    }
  }

  setWorkspace(id: string) {
    this.currentWorkspaceId = id;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vozlab_active_workspace', id);
    }
  }

  canEdit = $derived(() => {
    // Reactive derived logic for user permissions in the active workspace
    return true; 
  });
}

export const workspaceState = new WorkspaceState();

```

---

## 3. Graph Engine Integration (Cytoscape.js)

The graph viewer is encapsulated in a reusable component coupled to the Svelte 5 lifecycle (`$effect`), optimized to render subgraphs of up to 200 nodes with a deterministic layout (`dagre` / concentric) without continuous physics overhead.

```ts svelte
<!-- apps/web/src/lib/components/GraphCanvas.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import cytoscape from 'cytoscape';
  import { workspaceState } from '$lib/state/workspace.svelte.ts';

  let containerElement: HTMLDivElement;
  let cy: cytoscape.Core;

  let { nodes, edges } = $props<{ nodes: any[]; edges: any[] }>();

  onMount(() => {
    cy = cytoscape({
      container: containerElement,
      elements: { nodes, edges },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#1e3a8a',
            'label': 'data(title)',
            'color': '#ffffff',
            'font-size': '12px',
            'text-valign': 'bottom',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
          }
        }
      ],
      layout: { name: 'dagre', spacingFactor: 1.2 }
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      // Fires a selection event to open the side details panel
    });

    return () => {
      cy?.destroy();
    };
  });
</script>

<div bind:this={containerElement} class="w-full h-screen bg-slate-950"></div>

```

---

## 4. PWA, Service Workers and Online-First Strategy

* **Device Installation:** Configured with `vite-plugin-pwa` to allow installation as a standalone PWA (`display: standalone`) on mobile and desktop devices.
* **App Shell Caching:** Static resources (assets, CSS, fonts) are cached through Workbox.
* **Offline Behavior:** Upon connection loss, the PWA blocks write operations by showing an elegant warning banner, guaranteeing that the user retains clarity about the network state without compromising the consistency of the graph.
