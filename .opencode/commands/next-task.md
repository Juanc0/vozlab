---
description: Takes the next open item from ROADMAP.md or the active plan, executes it, validates it and updates the board.
agent: build
---

Act as the High-Level Engineering Committee.

1. **Pick the work:** first check `docs/plans/` for an open plan — if one is
   in flight, take its next unchecked task; otherwise read `ROADMAP.md` and
   take the first open (`[ ]`) item, respecting batch order. If the item is
   bigger than one PR-sized task, suggest `/new-plan <area>` instead of
   starting it inline.
2. **Load the context:** the area's `docs/components/<x>.md`, `docs/spec`-era
   design docs now under components, the ADRs in `docs/decisions/`,
   `docs/requirements.md`, `docs/conventions.md`, and `docs/knowledge/` if the
   task graduates a knowledge doc.
3. **Clarify before coding:** apply the **Clarification Protocol** (options
   with pros, cons, implications and cost) on technical ambiguities.
4. **Implement** the change in `apps/`, `packages/` and/or `docs/`, one
   component at a time. Validate wire input at the boundary (schema, not
   cast); no new `any`.
   Default execution style: **subagent-driven-development** (one fresh
   subagent per task); fall back to inline `executing-plans` only when
   subagents are unavailable or the user explicitly asks.
5. **Verify before claiming** anything: `pnpm turbo run build type-check
   test` green (9/9) and `pnpm lint` with 0 errors; `uv run pytest` + `uv run
   ruff check` if Python touched; `bash scripts/docs-hygiene.sh` green if any
   doc/path moved. Paste the real output — do not claim what you did not run
   (the 2026-10-29 audit found several such claims; the code is the truth).
6. **Same-commit evidence:** update the living doc the task's outcome belongs
   to (`docs/components/`, `api-reference.md`, `errors.md`, runbook) in the
   same change; a new design decision becomes an ADR.
7. **Update the board:** mark the checkbox in `ROADMAP.md` (or the plan) `[x]`
   with a one-line result; if a requirement status moved, update the matrix in
   `docs/README.md`. Unfinished slivers move to the next plan version or
   ROADMAP "Tracked, not scheduled" with an origin citation — never leave one
   implicit.
8. **Post-execution review gate:** if the task just completed was the LAST open
   task of an active plan, do NOT archive and do NOT mark the plan closed.
   Summarize what the plan shipped (tasks, evidence targets, ADRs) and ask the
   user: "All tasks done — archive now, or do you want adjustments/verification
   first?" Stop here and wait for the answer.
   - If the user wants adjustments → reopen the affected tasks (uncheck them)
     or open a `v<N+1>` carry-forward plan citing the origin; do not archive.
   - If the user confirms archive-ready → hand off to `/close-plan <path>`
     (which re-confirms before archiving).
   This gate prevents premature closure that later requires follow-up fix plans
   to undo or readjust already-archived work.
