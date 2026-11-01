# docs/plans/

**Active work only.** One directory per area (`plans/<area>/`), one file per
version (`v1.md`, `v2.md`, …). The rules of the game are in
[../README.md](../README.md) — "The working cycle". This file is the template.

A plan is a *work document*: it exists to be executed, and it dies complete
when it closes. It must not accumulate history, rationale or evidence — those
belong in `docs/` living pages and ADRs.

## Template

```markdown
# <Area> — v<N>

> Slice: vertical (flow by flow) | horizontal (layer by layer).
> Context: <link to components/<x>.md, knowledge/<y>.md, ADRs>.
> Opened: YYYY-MM-DD from <ROADMAP item / knowledge doc>.

## Goal
One paragraph. Done means: <observable outcome>.

## Tasks
- [ ] T1 — <exact acceptance> · layers: <api|web|db|devops> · evidence: <components/<x>.md §…> · size: S/M
- [ ] T2 — …

## Out of scope (this version)
- <thing> → <where it goes: plans/<area>/v<N+1> or ROADMAP "Tracked, not scheduled">

## Closure checklist (run before moving this file to archive/)
- [ ] every task's implementation is recorded in its living doc (evidence field above)
- [ ] decisions taken during execution became ADRs
- [ ] unfinished slivers were copied forward with origin cited
- [ ] docs/README.md snapshot + requirements matrix updated
- [ ] git mv plans/<area>/v<N>.md docs/archive/plans/<area>/v<N>.md
```

## Frontend plans

Frontend plans follow the same template above, but open with the walkthrough
in [docs/knowledge/frontend-plan-examples.md](../knowledge/frontend-plan-examples.md):
three worked examples (redesign one primitive, refine one screen section, add
a new layout shell), each with area name, goal, horizontal slicing, task
lines (acceptance/layers/evidence/size), out-of-scope and the open-plan
commit command. Load the frontend skills in `AGENTS.md` §"Frontend work"
before coding, and ship before/after screenshots in every UI task's evidence.

## Today

- [frontend-tooling/v1](../archive/plans/frontend-tooling/v1.md) — CLOSED 2026-10-31 (T1-T7 done):
  harness readiness for industrial-standard frontend work (enabled MCPs
  Playwright + Chrome DevTools, design-tokens audit, capture script, AGENTS.md
  §"Frontend work" section, web-quality-audit skill, plan-example walkthrough).
  Horizontal slicing; no UI code changes. Archived at
  `docs/archive/plans/frontend-tooling/v1.md`.

- [upgrade-waves/v1](../archive/plans/upgrade-waves/v1.md) — CLOSED 2026-10-31 (waves 0–4 done;
  wave 5 SvelteKit 3 deferred to v2): full dependency upgrade program.
  ADR-0047. Archived at `docs/archive/plans/upgrade-waves/v1.md`.
- [identity-consolidation/v1](../archive/plans/identity-consolidation/v1.md) — DEC-3/4/5 + (closed; see ROADMAP)
  audit P1–P9 merged (one mechanism per credential, zero cleartext email).
  Design record: [../analysis/db-identity-normalization.md](../analysis/db-identity-normalization.md);
  audit: [../analysis/db-auth-router-flows-audit.md](../analysis/db-auth-router-flows-audit.md).
  Previous act: [db-baseline v1](../archive/plans/db-baseline/v1.md) closed
  2026-10-30 (ADR-0044).
