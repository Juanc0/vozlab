# TASK-10 — Web: estado global, route groups, canvas, governance, offline, E2E

> Batch: v6.10 · Depends on: none · Size: XL · Self-contained: yes.

## 1. Context
Web is scaffold 3.1 only. State layer, route groups, Cytoscape canvas, governance UI, offline shell, E2E suite missing.

## 2. Objective
Implement SvelteKit state stores (auth, workspace), route groups ((auth), (app)), Cytoscape canvas for graph, governance UI (proposals review/approve/reject), offline shell (service worker caching), E2E suite (Playwright) covering admin/access flows.

## 3. Files to touch
- apps/web/src/lib/stores/* 
- apps/web/src/routes/(auth)/*, (app)/*
- apps/web/src/lib/components/graph/*
- apps/web/tests/e2e/*
- svelte.config.js, service worker

## 4. Acceptance criteria
- App builds and serves SSR.
- E2E smoke + admin flows pass.
- Offline shell works.
- build/type-check/test green.