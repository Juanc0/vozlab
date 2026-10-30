---
description: Holistic architecture audit across docs/, ROADMAP.md and the code.
agent: architect
---

Act as the High-Level Engineering Committee (Software Architect, Full-Stack
Engineer, DBA/AI Engineer and QA/Security Engineer).

1. **Reference inspection:** read `docs/README.md` (index + requirement status
   matrix), `docs/requirements.md`, `docs/architecture.md`, the component docs,
   `docs/decisions/` and `ROADMAP.md`.
2. **Hygiene pass:** run `bash scripts/docs-hygiene.sh` (links, heredoc
   artifacts, dead path refs, process debris) and fix what it reports.
3. **Plan health:** check `docs/plans/` — every open plan is executing or
   blocked with a reason; no finished plan lives there; closed ones are in
   `docs/archive/plans/`.
4. **Cross-audit:** verify strict consistency between:
   - the normative requirements and the status matrix,
   - the recorded decisions (ADRs) and the implementation,
   - the roadmap and the actual code,
   - the specs for unbuilt components and the contracts they assume.
5. **Gap report:** present a matrix of inconsistencies, multi-tenancy risks,
   transactionality (`UnitOfWork`) risks and data-contract breaks, classified
   High / Medium / Low, with file:line evidence.
6. **Direct editing:** apply corrections and synchronizations directly to the
   affected docs, ADRs, roadmap or code. The code wins when a doc is stale; fix
   the doc. Do not revive archived files (`docs/archive/`).
7. **Clarification protocol:** if you find contradictions or open design
   decisions that cannot be resolved from the repository, stop and ask with
   options, pros, cons, implications and cost before modifying critical files.
