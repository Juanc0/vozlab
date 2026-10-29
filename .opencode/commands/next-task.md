---
description: Takes the next open item from ROADMAP.md, executes it, validates it and updates the board.
agent: build
---

Act as the High-Level Engineering Committee.

1. Read `ROADMAP.md` and pick the first open (`[ ]`) item, respecting the batch
   order (do not start Phase 2/3 work before the current batch is closed unless
   the user says so).
2. Load the relevant detail: `docs/components/<component>.md`, the ADRs in
   `docs/decisions/`, `docs/requirements.md`, `docs/conventions.md`.
3. If there are technical ambiguities, apply the **Clarification Protocol**
   (options with pros, cons, implications and cost).
4. Implement the change in `apps/`, `packages/` and/or `docs/`.
5. Run `pnpm turbo run build type-check test` and fix anything red. Do not claim
   `pnpm lint` passes (it has known pre-existing debt).
6. Edit `ROADMAP.md`, mark the item `[x]` and add a one-line result note.
7. If a requirement status changed, update the matrix in `docs/README.md`; if a
   contract or behavior changed, update the affected doc in the same change.
   Record a new design decision as an ADR in `docs/decisions/`.
