---
description: Close an executed plan — run the closure checklist, archive it, update the docs snapshot.
---

Act as the High-Level Engineering Committee closing one area of deep work.

Argument = the plan path (e.g. `docs/plans/extractor/v1.md`). No argument:
list open plans in `docs/plans/` and ask which to close.

0. Pre-archive confirmation gate (do this FIRST). Before touching any
   file, present a short summary of what the plan shipped (tasks completed,
   evidence targets, ADRs) and ask the user explicitly:
   "Ready to archive, or do you want adjustments/verification first?"
   - If the user wants adjustments: do not archive. Either reopen the
     affected tasks (uncheck them in the plan) or open a v<N+1> carry-forward
     plan for the slivers, cite the origin, and stop. Report what was re-opened.
   - If the user confirms archive-ready: proceed to step 1.
   This gate exists because archiving too early forces follow-up fix plans
   (v<N+1>, v<N+2>) to undo or readjust already-archived work.

1. Inventory: read the plan; for every task, confirm it is [x] and that
   its "evidence lands in" target actually contains the evidence (open the
   living doc; do not trust the checkbox).

2. Run the closure checklist (from docs/plans/README.md):
   - every task's implementation is recorded in its docs/components/ doc;
   - decisions taken during execution became ADRs (index row + supersede
     markers if any);
   - unfinished slivers copied forward with origin citation — either a new
     docs/plans/<area>/v<N+1>.md "carried from vN" section or a ROADMAP
     "Tracked, not scheduled" line;
   - docs/README.md status snapshot + requirements matrix updated;
   - gate green fresh: pnpm turbo run build type-check test (9/9) +
     bash scripts/docs-hygiene.sh + (uv run pytest if Python touched).
   Fix anything missing in the same change — a plan does not close with a
   broken mirror.

3. Archive: git mv docs/plans/<area>/v<N>.md docs/archive/plans/<area>/v<N>.md
   (create the directory). The archive README is the only archived file you
   may touch, to add the row.

4. Commit docs(plans): close <area> v<N> — <one-line outcome> listing
   the evidence targets moved and the slivers re-homed.

After committing, report the closure and ask the user once more: "Anything to
adjust before this is final?" If yes, reopen (do not un-archive silently —
create a v<N+1> carry-forward).