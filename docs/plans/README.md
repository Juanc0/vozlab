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

## Today

- [db-baseline/v1](db-baseline/v1.md) — identity vocabulary coherence +
  migration baseline collapse + dev-volume reset. Design record:
  [../analysis/db-identity-normalization.md](../analysis/db-identity-normalization.md).
