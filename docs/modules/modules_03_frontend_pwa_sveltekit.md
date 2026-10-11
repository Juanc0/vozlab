---
title: "Especificación de Módulo: Frontend PWA, SvelteKit 5 Runes y Cytoscape.js"
version: 1.0.0
status: APPROVED
target_component: Frontend PWA (SvelteKit 5)
owner: Frontend & UX Team (VozLab)
---

# 03. FRONTEND PWA, SVELTEKIT 5 RUNES Y VISUALIZACIÓN DE GRAFOS

## 1. Arquitectura de UI y Enrutamiento (Group Layouts)

La PWA de VozLab se organiza utilizando **Group Layouts** de SvelteKit 5 para separar el acceso público y de autenticación de las vistas protegidas del grafo y la cocreación, manteniendo URLs limpias e institucionales (`app.vozlab.io/`).


```

apps/web/src/routes/
├── (app)/                           <-- GRUPO PROTEGIDO (Requiere sesión y Workspace activo)
│   ├── +layout.svelte               <-- Layout con barra lateral, selector de Workspace y notificaciones SSE
│   ├── +page.svelte                 <-- VISTA PRINCIPAL: Visualizador interactivo del Grafo (Cytoscape.js)
│   ├── discussions/
│   │   └── +page.svelte             <-- Hilos de debate y comentarios granulares
│   └── proposals/
│       └── +page.svelte             <-- Panel de Pull Requests y Propuestas Ontológicas
│
└── (auth)/                          <-- GRUPO PÚBLICO
├── login/
│   └── +page.svelte             <-- Pasarela OIDC SSO Institucional
└── join/
└── +page.svelte             <-- Acceso por Código QR / Sesión efímera de evento

```

---

## 2. Gestión de Estado Global con Runes de Svelte 5 (`$state`)

Se elimina el uso de stores globales tradicionales en favor de clases de estado tipadas con primitivas de reactividad de Svelte 5 (`$state`, `$derived`, `$effect`):

```typescript
// apps/web/src/lib/state/workspace.svelte.ts
class WorkspaceState {
  currentWorkspaceId = $state<string>('');
  workspaces = $state<Array<{ id: name: slug: string string; }>>([]);
  
  constructor() {
    // Inicialización segura desde sessionStorage por pestaña
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
    // Lógica derivada reactiva para permisos de usuario en el workspace activo
    return true; 
  });
}

export const workspaceState = new WorkspaceState();

```

---

## 3. Integración del Motor de Grafo (Cytoscape.js)

El visor de grafos se encapsula en un componente reutilizable acoplado al ciclo de vida de Svelte 5 (`$effect`), optimizado para renderizar subgrafos de hasta 200 nodos con diseño determinista (`dagre` / concéntrico) sin sobrecarga de física continua.

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
      // Dispara evento de selección para abrir panel lateral de detalles
    });

    return () => {
      cy?.destroy();
    };
  });
</script>

<div bind:this={containerElement} class="w-full h-screen bg-slate-950"></div>

```

---

## 4. Estrategia PWA, Service Workers y Online-First

* **Instalación en Dispositivo:** Configurado con `vite-plugin-pwa` para permitir su instalación como PWA independiente (`display: standalone`) en dispositivos móviles y de escritorio.
* **App Shell Caching:** Los recursos estáticos (assets, CSS, fuentes) se almacenan en caché mediante Workbox.
* **Comportamiento Offline:** Ante pérdida de conexión, la PWA bloquea las operaciones de escritura mostrando un banner de advertencia elegante, garantizando que el usuario mantenga claridad sobre el estado de la red sin comprometer la consistencia del grafo.
