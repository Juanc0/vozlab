# TASK-24 — De-duplicate Cursor Helpers + Make Soft-Delete Single-Writer

> **Batch:** Phase 1S.1 (Correctness) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Two copy-paste defects confirmed in the Phase-1R review:

1. **Cursor helpers duplicated 3×.** `encodeCursor` / `decodeCursor` and the whole
   `listByWorkspace` keyset body are copied verbatim in `DrizzleNodeRepository`,
   `DrizzleEdgeRepository` and `DrizzleDiscussionRepository`.
2. **Soft-delete written twice with two different timestamps.** `DeleteEdgeUseCase` calls
   `edge.softDelete()` (sets the in-memory `deletedAt`) and then `edgeRepo.softDelete()`
   (writes a **second** `new Date()`). The domain timestamp is dead; the two values differ.

## 2. Objective
Extract **one** keyset helper in `infrastructure/persistence`, reuse it in the three
repositories, and make the repository the **single writer** of `deleted_at`.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Drizzle/pg. The helper lives in `infrastructure/`.
- Malformed cursor → `ERR_VALIDATION_FAILED` (422), never a silent first page.
- Ordering stays `createdAt DESC, id DESC` for nodes/edges/threads,
  `createdAt ASC, id ASC` for posts.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/src/infrastructure/persistence/keyset.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleEdgeRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts` |
| Edit | `apps/api/src/application/use_cases/DeleteEdgeUseCase.ts` |
| Edit | `apps/api/src/domain/entities/Edge.ts` |

## 5. Step-by-step instructions
1. Create `infrastructure/persistence/keyset.ts` exporting:
   ```ts
   export function encodeCursor(createdAt: Date, id: string): string;
   export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null;
   /** Marks a cursor for keyset paging; `direction` mirrors the ORDER BY. */
   export function keysetAfter(
     createdAtColumn: AnyPgColumn,
     idColumn: AnyPgColumn,
     decoded: { createdAt: Date; id: string },
     direction: 'asc' | 'desc'
   ): SQL;
   ```
   Move the exact existing bodies in (base64 `"<iso>|<id>"`, `lastIndexOf('|')`, validity
   checks). `keysetAfter` returns
   `sql\`(${createdAtColumn}, ${idColumn}) < (${decoded.createdAt}, ${decoded.id})\`` for `desc`
   and `> (...)` for `asc`. Import `SQL`/`AnyPgColumn` from `drizzle-orm`.
2. In all three repositories: delete the local `encodeCursor`/`decodeCursor` functions and
   import from `../keyset.js`; replace the inline tuple-SQL with `keysetAfter(...)`.
   Behaviour must be byte-identical for the existing unit-shape (base64 of `iso|id`).
3. **Single-writer soft delete.** In `Edge`, delete the `softDelete()` method (it only mutated
   a value that was then overwritten). In `DeleteEdgeUseCase`, remove the `edge.softDelete()`
   call and keep only `await this.edgeRepo.softDelete(edge.id, input.tid)`. The adapter's
   `deletedAt: new Date()` is now the only stamp. Confirm the `EDGE_DELETED` event still
   publishes after the write.
4. Add a one-line note at the top of `keyset.ts`: *"Cursor encode/decode and keyset predicate
   live here only; repositories must not re-implement them."*

## 6. Constraints & gotchas
- Do not change cursor output format — existing clients/`nextCursor` values would break.
- Do not introduce `OFFSET`.
- `decodeCursor` must still return `null` for the empty string / missing separator / invalid
  date, so repositories keep throwing `ERR_VALIDATION_FAILED`.
- Keep the soft-delete **semantics** identical (one timestamp, repository-owned). Do not add
  a `deletedAt` column or endpoint here — that is TASK-25.

## 7. Acceptance criteria
- [ ] `grep -rn "function encodeCursor\|function decodeCursor" apps/api/src` returns matches in **exactly one** file.
- [ ] All three repositories import the shared helper.
- [ ] `DeleteEdgeUseCase` no longer calls a domain `softDelete()`; only one `deletedAt` is written per deletion.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "function encodeCursor\|function decodeCursor" apps/api/src
grep -rn "softDelete()" apps/api/src/application/use_cases/DeleteEdgeUseCase.ts || echo "single-writer"
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-24` `[x]` in `TODO.md` with a one-line result note,
  stating that TASK-23/25 may now reuse `keyset.ts`.

## 10. Out of scope
- New soft-delete columns/endpoints and read filtering (TASK-25).
- The `tx?: any` type debt.
