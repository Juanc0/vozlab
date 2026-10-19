# TASK-38 — Timestamp Ownership: Domain Owns `created_at`/`updated_at`, Adapter Owns `deleted_at`

> **Batch:** Phase 1T.3 (Layering) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Two writers stamp timestamps, with no written rule:

1. `DrizzleNodeRepository.update` and `.applyDelta` write `updatedAt: new Date()` **in the adapter**,
   ignoring `node.updatedAt` — but `Node.changeStatus`/`updateAttributes` already bump
   `this.updatedAt` in the domain. The domain field is therefore dead and the two can disagree.
2. `DiscussionPost.softDelete()` still stamps `deletedAt` **in the domain**, contradicting TASK-24
   ("the adapter is the single writer of `deleted_at`"). It has **no call site**
   (`grep -rn "\.softDelete()" apps/api/src` → empty) — it is dead code and the last latent second
   writer. TASK-24 removed `Edge.softDelete()` but missed this one.

This is concern #4: where do creates/updates/soft-deletes live under hexagonal architecture?

## 2. Objective
Adopt and document one rule — **the domain owns business timestamps (`created_at`, `updated_at`);
the adapter owns `deleted_at`** — and make the code obey it.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg.
- Behaviour stays identical except the single `updated_at` source.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Edit | `apps/api/src/domain/entities/DiscussionPost.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts` (only if the save path needs `deletedAt` removed) |
| Edit | `docs/modules/modules_02_backend_fastify_guide.md` (new §6.7 or extend §6.6) |
| Edit | `apps/api/tests/domain/Node.test.ts` (assert the persisted value comes from the entity) |
| Create | `apps/api/tests/infrastructure/timestampOwnership.test.ts` (thin, see step 4) |

## 5. Step-by-step instructions
1. In `DrizzleNodeRepository.update`, persist `updatedAt: node.updatedAt` (the value the domain
   already set) instead of `new Date()`.
2. In `DrizzleNodeRepository.applyDelta`, keep the same rule. `applyDelta` currently mutates the
   row from `proposedChanges` without a domain entity in hand — so it must **not** invent a
   timestamp range; the minimal correct change is to keep writing `new Date()` **but add a comment
   that this projection has no entity and is the documented exception**, *or* (preferred) load the
   node, call `node.updateAttributes(...)`/set title/description on the entity and persist
   `node.updatedAt`. Pick the option that keeps `applyDelta` a single update statement if loading the
   entity is too heavy; either way the rule must be written down in step 5.
3. In `DiscussionPost`, delete the `softDelete()` method (dead code). Remove `deletedAt` from the
   entity's mutable surface if nothing else writes it; keep reading it (`row.deletedAt ?? null` in
   `postToDomain`) so a deleted post still maps. If TypeScript forces the constructor argument to
   stay, keep it `readonly` and document that it is set only by persistence.
4. `apps/api/tests/domain/Node.test.ts`: add an assertion that `changeStatus`/`updateAttributes`
   produce an `updatedAt` that is `>=` the previous one and that the adapter contract is
   "persist `node.updatedAt`" (a thin unit test over the mapper/repository call is enough; a full
   fake Drizzle client is not required — assert the property you can, and note the rest as
   adapter-level).
5. Document the rule in `modules_02`:
   *Creates*: the use case builds the entity; the entity sets `createdAt`/`updatedAt`; the adapter
   only persists. *Updates / approved deltas*: the domain method is the single writer of
   `updatedAt`. *Soft-deletes*: a pure persistence concern — the adapter is the single writer of
   `deleted_at`; use cases never stamp it. *Reads*: adapters filter `deleted_at`; use cases enforce
   workspace/authorization.

## 6. Constraints & gotchas
- Do **not** add a `deletedAt` writer to any use case.
- Do **not** change the DB columns or migrations.
- Keep `DiscussionPost`'s counters (`registerVote`) unchanged.
- If you remove `deletedAt` from the constructor, update `postToDomain` and
  `tests/` accordingly (the discussion tests may construct posts).

## 7. Acceptance criteria
- [ ] `grep -rn "softDelete()" apps/api/src/domain` → no matches.
- [ ] `DrizzleNodeRepository.update` persists `node.updatedAt` (no `new Date()`).
- [ ] `applyDelta`'s timestamp behaviour is either entity-derived or the documented exception.
- [ ] The ownership rule is written in `modules_02`.
- [ ] `pnpm --filter @vozlab/api test` and `pnpm turbo run build` pass.

## 8. Verification commands
```bash
grep -rn "updatedAt: new Date()" apps/api/src
grep -rn "softDelete" apps/api/src/domain
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run the three commands; mark `TASK-38` `[x]` in `TODO.md` with a one-line result note stating the
  `applyDelta` option chosen (entity-derived vs documented exception).

## 10. Out of scope
- Adding `updated_at` to tables that lack it.
- Renaming the columns (TASK-39 handles vocabulary, not schema).
