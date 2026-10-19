# TASK-06 — Typed Domain Errors & Centralized HTTP Mapping

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** TASK-01 · **Size:** M
> **Self-contained:** yes.

## 1. Context
The codebase signals domain failures by throwing plain `Error` whose message *contains* an
`ERR_*` token, then re-parses that token with `message.includes(code)` in
`apps/api/src/infrastructure/http/controllers/errorResponse.ts`. This is fragile and has a
real bug: `EditProposal.autoApply` throws `ERR_UNMET_AUTO_APPLY_CRITERIA`, which is not in
`ERROR_CODES` nor in `DOMAIN_ERROR_CODES`, so it surfaces as a 500 instead of a 422.

Existing pieces:
- `packages/shared-types/src/errors/http-errors.ts` exports `ERROR_CODES`, `ErrorCode`
  (`keyof typeof ERROR_CODES`) and `buildError(code)`.
- Controllers currently used: `NodeController` (does its own error mapping and returns 500 for
  domain errors), `ProposalController` (`message.includes(...)`), and the newer controllers
  `EdgeController` / `OntologyController` / `DiscussionController` / `InteractionController`
  which use the shared `sendError(req, code)` + `mapDomainError(error)` helpers.
- Domain code that throws: `Node`, `Edge`, `EditProposal`, `OntologyClass`,
  `DatatypeProperty`, `ObjectProperty`, `DiscussionThread` entities and the use cases.

## 2. Objective
Introduce a single **typed domain error** and use it everywhere; map it to HTTP codes without
string parsing; make `ERR_UNMET_AUTO_APPLY_CRITERIA` a first-class error code.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` must stay free of Fastify/Drizzle/pg. A domain error class that only holds a
  string code is fine; do **not** import HTTP statuses into the domain.
- The HTTP vocabulary lives in `@vozlab/shared-types` (`ERROR_CODES`).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/src/domain/errors/DomainError.ts` |
| Edit | `packages/shared-types/src/errors/http-errors.ts` |
| Edit | `apps/api/src/domain/entities/Node.ts` |
| Edit | `apps/api/src/domain/entities/Edge.ts` |
| Edit | `apps/api/src/domain/entities/EditProposal.ts` |
| Edit | `apps/api/src/domain/entities/OntologyClass.ts` |
| Edit | `apps/api/src/domain/entities/DatatypeProperty.ts` |
| Edit | `apps/api/src/domain/entities/ObjectProperty.ts` |
| Edit | `apps/api/src/domain/entities/DiscussionThread.ts` |
| Edit | `apps/api/src/application/use_cases/*.ts` (replace `throw new Error('ERR_...')`) |
| Edit | `apps/api/src/infrastructure/http/controllers/errorResponse.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/NodeController.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/ProposalController.ts` |

## 5. Step-by-step instructions
1. Define the domain error codes as a union **in the domain** to keep the domain decoupled from
   the shared-types package, e.g.:
   ```ts
   export type DomainErrorCode =
     | 'ERR_INVALID_STATE_TRANSITION'
     | 'ERR_UNMET_AUTO_APPLY_CRITERIA'
     | 'ERR_NODE_NOT_FOUND'
     | 'ERR_EDGE_NOT_FOUND'
     | 'ERR_THREAD_NOT_FOUND'
     | 'ERR_PROPOSAL_NOT_FOUND'
     | 'ERR_DUPLICATE_INTERACTION'
     | 'ERR_INVALID_RELATION_DOMAIN_RANGE'
     | 'ERR_VALIDATION_FAILED'
     | 'ERR_AUTHORIZATION_FAILED';
   export class DomainError extends Error {
     constructor(public readonly code: DomainErrorCode, detail?: string) {
       super(detail ? `${code}: ${detail}` : code);
       this.name = 'DomainError';
     }
   }
   ```
2. Add the missing codes to `ERROR_CODES` (`ERR_UNMET_AUTO_APPLY_CRITERIA` → 422,
   `ERR_AUTHORIZATION_FAILED` → 403). Keep the existing shape `{ status, message }`.
3. Replace every `throw new Error('ERR_...')` in the entities and use cases with
   `throw new DomainError('ERR_...', 'optional detail')`.
4. Rewrite `errorResponse.ts`:
   - `mapDomainError(error)`: if `error instanceof DomainError`, map `error.code` to the
     matching `ErrorCode`; otherwise `ERR_INTERNAL_SERVER_ERROR`.
   - Keep `sendError(reply, code, extra?)` as-is.
   - Add a small `DOMAIN→HTTP` guard that guarantees only known codes are forwarded.
5. Refactor `NodeController` and `ProposalController` to use the shared
   `getRequestContext` (see `controllers/requestContext.ts`) + `sendError` + `mapDomainError`
   helpers (the Edge/Ontology/Discussion/Interaction controllers already do this). Remove all
   `message.includes(...)` logic.

## 6. Constraints & gotchas
- Do not throw HTTP status numbers from the domain; only `DomainErrorCode` strings.
- `AuthorHash` and other value objects may keep throwing `Error` for *programmer* errors
  (invalid hash format) — but if a controller can trigger them, convert them to `DomainError`.
- Preserve the success-response shapes of every endpoint.
- Watch for NodeNext: import `DomainError.js` with the `.js` extension from `.ts` files.

## 7. Acceptance criteria
- [ ] `DomainError` exists and is used by entities + use cases; no `throw new Error('ERR_` remains.
- [ ] `ERR_UNMET_AUTO_APPLY_CRITERIA` and `ERR_AUTHORIZATION_FAILED` exist in `ERROR_CODES`.
- [ ] `mapDomainError` uses `instanceof DomainError` (no `String.includes`).
- [ ] `NodeController` and `ProposalController` use the shared helpers.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -rn "throw new Error('ERR_" apps/api/src || echo "OK: none left"
grep -rn "message.includes" apps/api/src/infrastructure || echo "OK: none left"
```

## 9. Definition of done / handoff
- Build passes and the two greps are clean.
- Mark `TASK-06` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Adding a global Fastify error handler / problem+json envelope, and i18n of messages.
