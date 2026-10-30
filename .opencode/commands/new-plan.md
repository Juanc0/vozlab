---
description: Open a versioned plan for one area (docs/plans/<area>/vN.md) from a ROADMAP item, knowledge doc or the user's brief.
---

Act as the High-Level Engineering Committee opening one area for deep work.

Argument = the area (e.g. `extractor`, `e2e-graph`, `upgrade-waves`,
`production-go-live`). No argument: propose the highest-value candidate from
ROADMAP "Tracked, not scheduled" + the open analyses and ask.

1. **Read first:** the area's `docs/components/<x>.md` (or its design spec),
   related ADRs, `docs/knowledge/` material that graduates through this plan,
   the area's slivers in `ROADMAP.md`, and any archived plan for the same
   area under `docs/archive/plans/` (never revive its content — cite it).
2. **Scope with the user:** apply the Clarification Protocol (options with
   pros, cons, implications, cost) until the goal, the slicing style (vertical
   flows vs horizontal layers) and the explicit out-of-scope list are agreed.
   This is the `brainstorming` step; do not skip it to write tasks sooner.
3. **Write the plan** at `docs/plans/<area>/v<N>.md` following
   `docs/plans/README.md` (template). Every task line carries: exact
   acceptance, layers, **where the evidence lands** (living doc / ADR), size.
   Tasks are PR-sized: each one leaves the gate green.
4. **Review the plan with the user** (this is the gate to execution — ask
   "does this capture what you want, and do you want inline execution
   (`executing-plans`) or one fresh subagent per task
   (`subagent-driven-development`, recommended)?").
5. **Register it:** one ROADMAP line pointing at the plan with its version;
   commit `docs(plans): open <area> v<N> — <goal>` with the plan only (no
   code).
