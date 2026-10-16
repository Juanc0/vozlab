---
description: Performs a holistic architecture audit between the /docs folder, the EXECUTION_PLAN.md and the TODO.md at the root.
---

Act as the High-Level Engineering Committee (Software Architect, Full-Stack Engineer, DBA/AI Engineer and QA/Security Engineer).

1. **Reference Inspection:** Examine the reference documentation in the `/docs` folder (including `/docs/system/`, `/docs/modules/` and `/docs/devops/`), as well as the governing files at the monorepo root: `EXECUTION_PLAN.md` and `TODO.md`.
2. **Cross Audit:** Verify strict consistency between:
   - The theoretical specifications of `/docs`.
   - The atomic breakdown of `EXECUTION_PLAN.md`.
   - The current state reflected in `TODO.md`.
   - The existing code in `apps/` and `packages/`.
3. **Gap Report:** Present a Matrix of Inconsistencies, multi-tenancy risks, transactionality (`UnitOfWork`) or data contracts classified by severity (High, Medium, Low).
4. **Direct Editing:** Apply corrections, improvements and synchronizations directly on the affected markdown files in `/docs/` or in the root `EXECUTION_PLAN.md` if the technical scope needs to be adjusted.
5. **Clarification Protocol:** If you detect insurmountable contradictions or open design decisions between the documentation and the plan, stop and apply the scoping question protocol with options, pros, cons and implications in VozLab before modifying critical files.
