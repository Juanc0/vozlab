# TASK-43 — Type the Transaction Handle (`tx?: any` → `DbTransaction`)

> **Batch:** Phase 1T.5 (Type Safety) · **Depends on:** TASK-39 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Every port and adapter repeats `tx?: any` (deferred in TASK-16/24/30 as type-safety debt, `M-15`).
Examples: `INodeRepository.save(node, tid, tx?: any)`, `IProposalRepository.updateStatus(..., tx?: any)`,
and every `Drizzle*Repository`'s `private async client(tid, tx?: any)`. Because `any` disables
checking, a wrong transaction handle type is never caught at compile time.

`UnitOfWork.runInTransaction(tid, cb)` hands the callback a Drizzle transaction object from
`drizzle-orm/node-postgres`. That type is already nameable.

## 2. Objective
Replace `tx?: any` with a single exported transaction type so the ports stay framework-agnostic but
type-safe, with a mechanical, compile-verified change.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass; `pnpm --filter @vozlab/api test` must stay green.
- `domain/` must not import Drizzle/pg. Therefore the transaction type **may not** be declared in
  `domain/` as a concrete Drizzle type.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `apps/api/src/domain/ports/Transaction.ts` (opaque alias) |
| Edit | every `apps/api/src/domain/ports/*.ts` using `tx?: any` |
| Edit | every `apps/api/src/infrastructure/persistence/repositories/*.ts` `client(tid, tx)` signature |
| Edit | `apps/api/src/infrastructure/persistence/UnitOfWork.ts` |
| Edit | any use case that threads `tx` (type imports) |

## 5. Step-by-step instructions
1. Create `domain/ports/Transaction.ts`:
   ```ts
   /**
    * Opaque transaction handle threaded through repositories so a multi-table
    * write can run atomically. The concrete type is provided by the
    * persistence adapter (Drizzle); the domain only needs to pass it through.
    */
   export type DbTransaction = unknown;
   ```
   Rationale: the domain must not depend on Drizzle, so the port exposes an opaque handle. To keep
   **actual** safety, the adapters narrow it internally.
2. In the Drizzle adapters, define a concrete private alias and narrow once:
   ```ts
   type Tx = Parameters<Parameters<ReturnType<typeof drizzle>['transaction']>[0]>[0];
   private async client(tid: string, tx?: DbTransaction) {
     return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
   }
   ```
   Adjust to the real Drizzle type name available in `drizzle-orm/node-postgres` (a `NodePgTransaction`
   or the `Parameters<…>` extraction above) — verify by compiling.
3. Replace every `tx?: any` in the ports with `tx?: DbTransaction` and re-export `DbTransaction`
   where convenient. Update `UnitOfWork.runInTransaction`'s callback parameter type so call sites
   infer `DbTransaction`.
4. Make sure the use cases (`ApproveProposalUseCase`, `AutoApplyProposalUseCase`,
   `CastVoteUseCase`, `ActivateOntologyClassUseCase`, …) still compile unchanged (they mostly pass
   `tx` through).
5. `grep -rn "tx?: any\|(.*tx: any" apps/api/src` must be empty afterwards.

## 6. Constraints & gotchas
- Do **not** move the concrete Drizzle type into `domain/`.
- Do **not** change runtime behaviour or the pool manager.
- If the Drizzle transaction type is awkward to name, `DbTransaction = unknown` + a single `as Tx`
  cast per adapter is acceptable and preferable to `any` on the ports; never use `any`.
- Keep `tx` optional (`tx?`) — non-transactional writes still go through the pool.

## 7. Acceptance criteria
- [ ] `grep -rn "tx?: any" apps/api/src` → no matches.
- [ ] `domain/*` imports no Drizzle/pg symbol.
- [ ] `pnpm turbo run build` passes (3/3) and `pnpm --filter @vozlab/api test` stays green.

## 8. Verification commands
```bash
grep -rn "tx?: any" apps/api/src || echo "typed"
grep -rn "drizzle-orm\|from 'pg'" apps/api/src/domain || echo "domain clean"
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run all commands; mark `TASK-43` `[x]` in `TODO.md` with a one-line result note naming the concrete
  transaction type used in the adapters. TASK-44 (tests) builds on the final signatures.

## 10. Out of scope
- Changing the `UnitOfWork` algorithm.
- Introducing a new ORM or a transaction abstraction beyond the alias.
