# TASK-39 — Port/Adapter Naming Convention + Bounded Renames

> **Batch:** Phase 1T.3 (Vocabulary) · **Depends on:** TASK-38 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
The same concept is named three different ways across ports/adapters (concern #6):

| Concept | Current names |
| --- | --- |
| Soft-delete | `softDelete` (node/edge) · `softDeletePost` (discussion) |
| Fetch one | `findById` · `findByIdInWorkspace` · `findPostById` · `findThreadById` |
| Update | `update` (node/edge) · `updateThreadStatus` |
| Apply a delta | `applyDelta` (node/edge) · `applyClassDelta` (ontology) · `applyScoreDelta` (interaction) |
| List | `listByWorkspace` · `findByWorkspace` (proposal) · `listThreads`/`listPosts` |

None of these is *wrong*, but there is no stated convention, so every new adapter invents names.

## 2. Objective
Write **one** canonical vocabulary in `modules_02` and apply a **bounded, grep-verifiable** rename of
the worst offenders, with no behaviour change.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass; `pnpm --filter @vozlab/api test` must stay green.
- Renames are mechanical: do not change signatures, return types or error codes.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `docs/modules/modules_02_backend_fastify_guide.md` (new §6.7 "Port vocabulary") |
| Edit | `apps/api/src/domain/ports/*.ts` (renamed members) |
| Edit | `apps/api/src/infrastructure/persistence/repositories/*.ts` (impls) |
| Edit | every call site under `apps/api/src/application/` + `infrastructure/http/` |
| Edit | `apps/api/tests/application/CloseThreadUseCase.test.ts` (its `IDiscussionRepository` fake implements the renamed members) |

## 5. Step-by-step instructions
1. State the convention in `modules_02 §6.7`:
   - **Verbs:** `find…` (single, nullable), `list…` (collection), `save` (insert), `update`
     (persist a mutated entity), `softDelete`, `apply…Delta`.
   - **Disambiguation suffix:** `…ById`, `…ByKey`, `…InWorkspace` when the scope is not the whole
     signature's first argument. Prefer `…InWorkspace` for a **security scope** and `…ByWorkspace`
     for a plain filter (this matches `findByIdInWorkspace` in the proposal port).
   - **One soft-delete verb per port:** `softDelete` (the collection is implied by the port).
2. **Bounded renames** (only these; leave the rest as-is unless a rename is forced):
   - `IDiscussionRepository.softDeletePost` → `softDelete` (and `DrizzleDiscussionRepository` +
     `DeletePostUseCase` call site).
   - `IDiscussionRepository.updateThreadStatus` → `update` (and the two call sites: `CloseThreadUseCase`,
     the drizzle impl).
   - `IProposalRepository.findByWorkspace` is a **list** → rename to `listByWorkspace` **only if**
     its shape already matches `listByWorkspace` elsewhere (returns `{ items, nextCursor }`); it
     does, so align it. Update `ListProposalsUseCase` + the adapter.
   - Leave `applyDelta` / `applyClassDelta` / `applyScoreDelta` (they operate on different aggregates
     and are already `apply…Delta`).
   - Leave `existsInWorkspace` (it is a boolean predicate; `find…` would be misleading).
3. After the renames, run every grep in §8 and fix compile errors until clean. The existing
   `apps/api/tests/application/CloseThreadUseCase.test.ts` implements the discussion port as a fake,
   so update its `updateThreadStatus`/`softDeletePost` members to the new names (the test must stay
   green).
4. Add a one-line comment at the top of each touched port: *"Naming follows `modules_02 §6.7`."*

## 6. Constraints & gotchas
- Do **not** rename DB columns, error codes, routes or DTO fields — only TypeScript members.
- Do **not** fold two methods into one or change `tx?: any` (TASK-43 does that).
- Keep `IEdgeRepository.softDelete` / `INodeRepository.softDelete` names (already canonical).
- The proposal DTO/controller keeps returning `{ proposals, nextCursor }`.

## 7. Acceptance criteria
- [ ] `modules_02 §6.7` defines the vocabulary.
- [ ] `grep -rn "softDeletePost\|updateThreadStatus" apps/api/src` → no matches.
- [ ] `grep -rn "findByWorkspace" apps/api/src` → no matches (now `listByWorkspace`).
- [ ] `pnpm --filter @vozlab/api test` passes and `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -rn "softDeletePost\|updateThreadStatus\|findByWorkspace" apps/api/src || echo "renamed"
pnpm --filter @vozlab/api test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run all three; mark `TASK-39` `[x]` in `TODO.md` with a one-line result note listing the renamed
  members, so TASK-43 (tx typing) starts from the final names.

## 10. Out of scope
- Renaming routes, DTOs, DB columns or error codes.
- The `tx?: any` change (TASK-43).
