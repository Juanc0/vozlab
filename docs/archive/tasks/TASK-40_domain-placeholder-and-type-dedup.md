# TASK-40 — Remove Domain Placeholder Defaults + De-duplicate Dev Role Types

> **Batch:** Phase 1T.3 (Vocabulary) · **Depends on:** TASK-39 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Two leftover vocabulary duplications:

1. **`'unknown'` placeholder defaults in the domain.** TASK-20 removed identity fallbacks but left
   three constructor defaults:
   ```
   OntologyClass.ts:18:      public readonly proposedBy: string = 'unknown',
   DatatypeProperty.ts:23:   public readonly proposedBy: string = 'unknown',
   ObjectProperty.ts:22:     public readonly proposedBy: string = 'unknown',
   ```
   They are currently unreachable (all six construction sites pass `proposedBy`), but they are a
   second vocabulary for "missing maintainer" and `grep "'unknown'"` is meant to be empty.
2. **Dev fixtures re-declare role unions.** `packages/database/scripts/dev-identities.ts` defines
   ```
   export type SystemRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'SYSTEM_AGENT';
   export type WorkspaceRole = 'ADMIN' | 'MODERATOR' | 'MEMBER';
   ```
   instead of importing them, while it *does* import `AgentType`. TASK-28 made the schema the single
   declaration; the script drifted.

## 2. Objective
Fail-closed on a missing maintainer and consume the shared role schemas everywhere, so the
vocabulary is declared once.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Shared vocabulary lives in `@vozlab/shared-types`; never restate the literals in two layers.
- `domain/` must not import Fastify/Drizzle/pg (importing `@vozlab/shared-types` **types** is allowed).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/domain/entities/OntologyClass.ts` |
| Edit | `apps/api/src/domain/entities/DatatypeProperty.ts` |
| Edit | `apps/api/src/domain/entities/ObjectProperty.ts` |
| Edit | `packages/database/scripts/dev-identities.ts` |

## 5. Step-by-step instructions
1. For the three entities, make the missing-maintainer state **fail closed**: change the default to
   the empty string `''` with a comment *"no maintainer: an empty hash can never equal a resolved
   pseudonym"*, **or** remove the default entirely by making `proposedBy` a required parameter (this
   requires moving it before the optional parameters — TypeScript's positional-default rule). Prefer
   whichever keeps the constructors readable; the acceptance criterion is that `'unknown'` no longer
   appears in `apps/api/src`.
2. Update the six construction sites if you remove the default (they already pass it, so a
   required parameter should compile unchanged).
3. In `dev-identities.ts`:
   - `import type { AgentType, SystemRole, WorkspaceRole } from '@vozlab/shared-types';` and delete
     the two local `type` aliases; re-export them if consumers import from this module
     (`export type { AgentType, SystemRole, WorkspaceRole };`).
   - Confirm `@vozlab/database` depends on `@vozlab/shared-types` (it does).
   - Keep the literal values unchanged (`USER`/`MODERATOR`/`ADMIN`/`MEMBER`/`SYSTEM_AGENT`).
4. Make sure the `agent` fixture's `systemRole: 'SYSTEM_AGENT'` still type-checks against
   `SystemRole`.

## 6. Constraints & gotchas
- Do **not** change `AuthorHash` behaviour (a token with a valid 64-hex hash stays verbatim).
- Do **not** add salt to the dev fixtures' `authorHash` (TASK-37 depends on the current values).
- Do **not** touch `AgentTypeSchema`/`WorkspaceRoleSchema`/`SystemRoleSchema` themselves.
- A domain entity must never hash anything; empty string is fine, hashing is not.

## 7. Acceptance criteria
- [ ] `grep -rn "'unknown'" apps/api/src` → no matches.
- [ ] `grep -rn "type SystemRole\|type WorkspaceRole" packages/database/scripts` → no local literals.
- [ ] `pnpm --filter @vozlab/database db:seed:dev` still type-checks (no DB needed to build).
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "'unknown'" apps/api/src || echo "clean"
grep -rn "export type SystemRole\|export type WorkspaceRole" packages/database/scripts
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-40` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Any identity/authorization behaviour change.
- Reworking the dev fixtures' UUIDs.
