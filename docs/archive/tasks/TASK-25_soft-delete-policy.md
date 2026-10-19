# TASK-25 — Soft-Delete Policy: Filter Reads, Add Node/Post Deletion, Document the Rule

> **Batch:** Phase 1S.3 (Policy) · **Depends on:** TASK-22, TASK-24 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`docs/modules/modules_01 §2` says *"All main tables implement logical deletion … to prevent
entity deletion from breaking relationships or associated edit proposals."* The
implementation is inconsistent:

| Table | `deleted_at` | read filters it | delete endpoint |
| --- | --- | --- | --- |
| `public.nodes` | yes | yes | **none** |
| `public.edges` | yes | yes | yes (author-only) |
| `social.discussion_posts` | yes | **no** (M-1: `listPosts` leaks soft-deleted posts) | **none** |
| `social.discussion_threads` | no | — | — (status-based `close`) |
| `public.edit_proposals` | no | — | — (status-based) |
| `meta.ontology_*` | no | — | — (status-based `REJECTED`) |
| `public.interactions_log` | no | — | — (immutable log) |

## 2. Objective
Make the soft-delete behaviour consistent with the documented rule, and record the rule
itself so the ambiguity does not return: filter soft-deleted rows on read, add the missing
`DELETE` endpoints for nodes and posts, and write down which entities deliberately do **not**
use `deleted_at`.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- The **repository is the single writer** of `deleted_at` (established by TASK-24); use cases
  must not also stamp it.
- Author-only deletion (mirror `DeleteEdgeUseCase`): non-author → 403 `ERR_AUTHORIZATION_FAILED`;
  missing/foreign-workspace → 404.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts` |
| Edit | `apps/api/src/domain/ports/IDiscussionRepository.ts` |
| Edit | `apps/api/src/domain/ports/INodeRepository.ts` |
| Edit | `apps/api/src/infrastructure/persistence/repositories/DrizzleNodeRepository.ts` |
| Create | `apps/api/src/application/use_cases/DeleteNodeUseCase.ts` |
| Create | `apps/api/src/application/use_cases/DeletePostUseCase.ts` |
| Edit | `apps/api/src/application/use_cases/ListPostsUseCase.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/NodeController.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/DiscussionController.ts` |
| Edit | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | `apps/api/src/infrastructure/http/server.ts` |
| Edit | `docs/modules/modules_01_*.md` (§2) |

## 5. Step-by-step instructions
1. **Fix the leak.** In `DrizzleDiscussionRepository.listPosts`, add
   `isNull(discussionPosts.deletedAt)` to the `conditions` array (keep the keyset predicate).
2. **Post soft delete.** Add to `IDiscussionRepository`:
   `findPostById(id: string, tid: string): Promise<DiscussionPost | null>` (filter
   `isNull(deletedAt)`) and `softDeletePost(id: string, tid: string, tx?: any): Promise<void>`
   (adapter: `update(discussionPosts).set({ deletedAt: new Date() }).where(eq(...))`).
3. **Node soft delete.** Add `softDelete(id: string, tid: string, tx?: any): Promise<void>` to
   `INodeRepository` and implement it in `DrizzleNodeRepository` (same `set({ deletedAt: new Date() })`).
4. **Use cases.**
   - `DeleteNodeUseCase.execute({ nodeId, workspaceId, tid, authorHash, reqId? })`:
     `findById`; 404 `ERR_NODE_NOT_FOUND` if missing or `workspaceId` mismatch (TASK-22 rule);
     403 `ERR_AUTHORIZATION_FAILED` if `authorHash` differs; then `nodeRepo.softDelete`;
     publish `NODE_DELETED` post-commit.
   - `DeletePostUseCase.execute({ postId, threadId, workspaceId, tid, authorHash, reqId? })`:
     load thread (404 `ERR_THREAD_NOT_FOUND` if missing/foreign workspace), load post
     (404 `ERR_POST_NOT_FOUND`), verify the post belongs to `threadId`, 403 if not author,
     then `softDeletePost`, publish `POST_DELETED`.
5. **Routes.**
   - `DELETE /api/v1/nodes/:id` → `nodeController.delete(req, reply)`.
   - `DELETE /api/v1/discussions/posts/:id` → `discussionController.deletePostHandler(req, reply)`.
   Register `DELETE /discussions/posts/:id` **before** nothing conflicting (it is its own path);
   keep `/nodes/:id` after `/nodes/subgraph`.
   Wire `DeleteNodeUseCase` / `DeletePostUseCase` in `server.ts` + `RouteDependencies`.
6. **Error code.** If `ERR_POST_NOT_FOUND` does not exist in
   `packages/shared-types/src/errors/http-errors.ts`, add it (`404`, "Discussion post not found").
   Also add `ERR_POST_NOT_FOUND` to `DomainError`'s code union if that union is explicit.
7. **Document the policy.** In `docs/modules/modules_01` §2 replace the broad sentence with the
   table above (or an equivalent list), stating explicitly: nodes/edges/posts use `deleted_at`
   + endpoint; threads use status (`OPEN`/`CLOSED`); proposals and ontology entries use status;
   `interactions_log` is immutable and is never deleted.

## 6. Constraints & gotchas
- Deleting a node does not cascade to edges at the domain level — both are soft-deleted
  independently; do **not** hard-delete or mutate edges here.
- `listPosts` must keep returning `nextCursor` consistent after filtering (the shared keyset
  helper already handles it; just add the `isNull` condition).
- Do not add `deleted_at` to `discussion_threads`, `edit_proposals` or `meta.*` in this task —
  the policy is status-based for them.
- `DELETE /nodes/:id` must not break `GET /nodes/subgraph` (deleted nodes are already filtered
  by the CTE).
- Non-author attempts must not reveal existence: check workspace first, then author.

## 7. Acceptance criteria
- [ ] `listPosts` never returns soft-deleted posts.
- [ ] `DELETE /api/v1/nodes/:id` soft-deletes (author-only) and the node disappears from reads/subgraph.
- [ ] `DELETE /api/v1/discussions/posts/:id` soft-deletes (author-only) and the post disappears from `GET …/posts`.
- [ ] Deleting twice is idempotent from the client's perspective (second call → 404, no error).
- [ ] The soft-delete policy is written in `docs/modules/modules_01` §2.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "isNull(discussionPosts.deletedAt)" apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts
grep -n "nodes/:id\|discussions/posts/:id" apps/api/src/infrastructure/http/routes.ts
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-25` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Hard delete / GDPR erasure (not specified).
- Restore/undelete endpoints.
- Thread soft-delete (documented as status-based on purpose).
