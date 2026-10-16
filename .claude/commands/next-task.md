---
description: Takes the next atomic task from TODO.md, executes it, validates it and updates the status.
---

Act as the High-Level Engineering Committee.

1. Read the `TODO.md` file to identify the first pending task (`[ ]`).
2. Consult `EXECUTION_PLAN.md` if you require the technical detail of that milestone.
3. If there are technical ambiguities, apply the **Clarification Protocol** (ask me options with pros, cons and implications).
4. Implement the necessary code in `apps/` or `packages/`.
5. Run `pnpm turbo run build` to validate that the compilation is successful.
6. **Edit the `TODO.md` file** marking the task as completed (`[x]`) and include the results obtained.
