# TASK-28 — Typed Enums at the Boundaries (kill magic strings)

> **Batch:** Phase 1S.3 (Policy) · **Depends on:** TASK-21 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
TypeScript already narrows the declared unions in most places, but a few `string` values cross a
boundary and are compared with restated literals. The concrete offenders found in the Phase-1R
review (L-1):

- `role !== 'MODERATOR' && role !== 'ADMIN'` — `AutoApplyProposalUseCase:49`,
  `ActivateOntologyClassUseCase:39`.
- `AGENT_TYPES: ReadonlySet<string>` in `AuthGuard` (being fixed by **TASK-21** with
  `AgentTypeSchema`; reuse it, do not re-add a set).
- `getRateLimitMax(method: string)` inline array in `RateLimitingMiddleware`.
- `switch (proposal.targetType)` / `switch (targetType)` in `ApproveProposalUseCase` and
  `DrizzleInteractionRepository.applyScoreDelta` — these must stay exhaustive.

The goal is **declare once, consume everywhere**: Zod `z.enum` in `@vozlab/shared-types`,
derived union types consumed by domain/infrastructure.

## 2. Objective
Give every boundary-checked value a single typed source and make the key `switch` statements
compile-time exhaustive, so adding a new member without handling it becomes a build error.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg; importing `@vozlab/shared-types` **types** is
  acceptable (they are pure DTOs).
- Do not duplicate a Zod enum in two packages. Do not restate literals in `if`/`switch`.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `packages/shared-types/src/schemas/roles.schema.ts` |
| Edit | `packages/shared-types/src/index.ts` |
| Create | `apps/api/src/shared/assertNever.ts` |
| Edit | `apps/api/src/domain/ports/IMembershipRepository.ts` |
| Edit | `apps/api/src/application/use_cases/AutoApplyProposalUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/ActivateOntologyClassUseCase.ts` |
| Edit | `apps/api/src/infrastructure/http/middlewares/RateLimitingMiddleware.ts` |
| Edit | `apps/api/src/application/use_cases/ApproveProposalUseCase.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleInteractionRepository.ts` |
| Edit | `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts` (only if TASK-21 left literals) |

## 5. Step-by-step instructions
1. Create `packages/shared-types/src/schemas/roles.schema.ts`:
   ```ts
   export const WorkspaceRoleSchema = z.enum(['ADMIN', 'MODERATOR', 'MEMBER']);
   export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

   export const SystemRoleSchema = z.enum(['USER', 'ADMIN', 'MODERATOR', 'SYSTEM_AGENT']);
   export type SystemRole = z.infer<typeof SystemRoleSchema>;

   /** ADMIN or MODERATOR may resolve governance items (FR-09/FR-12 roles). */
   export function isModeratorOrAdmin(role: WorkspaceRole | null): boolean {
     return role === 'ADMIN' || role === 'MODERATOR';
   }
   ```
   Export from `index.ts`.
2. `IMembershipRepository`: delete the local `WorkspaceRole` union and
   `import type { WorkspaceRole } from '@vozlab/shared-types'` + `export type { WorkspaceRole }`
   (re-export so existing imports keep working).
3. Replace both role checks with `if (!isModeratorOrAdmin(role)) throw new DomainError('ERR_AUTHORIZATION_FAILED');`.
4. `RateLimitingMiddleware`: hoist `const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;`
   and test with `(WRITE_METHODS as readonly string[]).includes(method)`; keep `GET` → read max.
5. Add `apps/api/src/shared/assertNever.ts`:
   ```ts
   export function assertNever(value: never, context = 'unexpected value'): never {
     throw new Error(`${context}: ${JSON.stringify(value)}`);
   }
   ```
   (This is infrastructure/shared, not `domain/`, since it throws a plain `Error`.)
6. Make the two `switch`es exhaustive:
   - `ApproveProposalUseCase.applyProposalDelta`: keep cases `NODE`/`EDGE`/`ONTOLOGY`, replace
     `default:` with `default: return assertNever(proposal.targetType, 'proposal targetType');`.
   - `DrizzleInteractionRepository.applyScoreDelta`: keep `NODE`/`EDGE`/`PROPOSAL`/`POST`,
     replace the `default: throw new DomainError('ERR_VALIDATION_FAILED', ...)` with
     `default: return assertNever(targetType as never, 'interaction targetType');` — but keep
     the runtime `DomainError` mapping for untyped DB rows: cast the switch key to the Zod-derived
     union `InteractionTargetType` first, so a bad DB value still throws `ERR_VALIDATION_FAILED`.
     (Practical shape: `switch (targetType as InteractionTargetType) { … default: throw new DomainError('ERR_VALIDATION_FAILED', …) }` is acceptable **only** if the compiler proves the
     default unreachable via `assertNever` on the typed value.)
7. Verify `AuthGuard` uses `AgentTypeSchema.options` (TASK-21) and defines no `Set<string>` of literals.

## 6. Constraints & gotchas
- `assertNever` belongs to `shared/`, **not** `domain/` (it throws a non-domain error); domain
  code must not import it.
- Do not rename `WorkspaceRole` at call sites — re-export it.
- `SystemRoleSchema` includes `'ADMIN'|'MODERATOR'` because the DB comment lists them for
  `auth.users.system_role`; keep the schema aligned with `tenant.auth.schema.ts`, and if that
  comment is wrong, fix the comment in the same change.
- Do not touch `AgentTypeSchema` (TASK-21 owns it).
- `role` can be `null` (a non-member); `isModeratorOrAdmin(null) === false`.

## 7. Acceptance criteria
- [ ] `grep -rn "'MODERATOR' && role !== 'ADMIN'\|!== 'MODERATOR' && role !== 'ADMIN'" apps/api/src` → no matches.
- [ ] `WorkspaceRoleSchema` is the single declaration of the workspace-role union.
- [ ] Both `switch`es end with `assertNever` (no silently-ignored new member).
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "role !== 'MODERATOR'" apps/api/src || echo "role checks centralized"
grep -rn "assertNever" apps/api/src
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-28` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Consolidating `NodeStatus`/`EdgeStatus` domain unions into shared-types (add only if a boundary
  parses them).
- Any behaviour change — this task is types/vocabulary only.
