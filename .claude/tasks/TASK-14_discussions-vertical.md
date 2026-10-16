# TASK-14 — Discussions Vertical: Wire Threads/Posts + Read Endpoints

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-06, TASK-10 · **Size:** M
> **Self-contained:** yes.

## 1. Context
FR-11/FR-16 require governance discussions: a thread attached to any target, with hierarchical
(self-referencing) comment posts and per-comment voting, stored under the `social` schema
(`social.discussion_threads`, `social.discussion_posts`).

The code already has:
- Entities `DiscussionThread` (`close()` state machine) and `DiscussionPost`
  (`registerVote`, `softDelete`).
- Port `IDiscussionRepository` + adapter `DrizzleDiscussionRepository` (scoped by `tid`).
- Use cases `CreateThreadUseCase` and `AddPostUseCase` (publishes `THREAD_CREATED` /
  `POST_CREATED`).
- Controller `DiscussionController` (`createThreadHandler`, `addPostHandler`).
- Schemas `CreateThreadSchema`, `CreatePostSchema` in `packages/shared-types`.

**What is missing:** the vertical is **not wired** (`routes.ts` has no `/discussions` route,
`server.ts` never instantiates the repo/use cases). There are also no read endpoints (list
threads for a target, list posts in a thread) and no thread-close endpoint.

## 2. Objective
Wire discussions end-to-end and add bounded read endpoints for the PWA.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; adapters take `tid`; manual Composition Root.
- Lists must be bounded (NFR-04 spirit); use cursor pagination like TASK-10.
- Errors via `DomainError` + `sendError`/`mapDomainError` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Edit | port | `apps/api/src/domain/ports/IDiscussionRepository.ts` |
| Edit | adapter | `apps/api/src/infrastructure/persistence/repositories/DrizzleDiscussionRepository.ts` |
| Create | use case | `apps/api/src/application/use_cases/ListThreadsUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/ListPostsUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/CloseThreadUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/CreateThreadUseCase.ts` / `AddPostUseCase.ts` (DomainError) |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/DiscussionController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. Add cursor pagination to `IDiscussionRepository`:
   - `listThreads(targetId, targetType, { limit, cursor }, tid)` ordered by `createdAt DESC, id DESC`;
   - `listPosts(threadId, { limit, cursor }, tid)` ordered by `createdAt ASC, id ASC`
     (stable read of a conversation).
   Implement in the adapter with the same opaque-cursor encoding used in TASK-10.
2. `ListThreadsUseCase({ targetId, targetType, workspaceId, tid, limit, cursor })` → returns
   threads (beware: `discussion_threads` has `workspaceId`; filter it too).
3. `ListPostsUseCase({ threadId, tid, limit, cursor })` → verifies the thread exists
   (`findThreadById`) else `DomainError('ERR_THREAD_NOT_FOUND')`, then returns posts.
4. `CloseThreadUseCase({ threadId, tid, authorHash })`:
   - only the thread creator may close it (`thread.createdByHash.toString() === authorHash`),
     else `DomainError('ERR_AUTHORIZATION_FAILED')`;
   - call `thread.close()` (domain state machine) and persist (add a `saveThread`-style update
     or an `updateThreadStatus` method to the port/adapter);
   - publish `THREAD_CLOSED`.
5. `DiscussionController`: add `listThreads`, `listPosts`, `closeThread` handlers in the same
   style as the existing ones.
6. `routes.ts` (guard chain):
   - `POST /api/v1/discussions`
   - `GET  /api/v1/discussions?targetId=&targetType=&limit=&cursor=`
   - `POST /api/v1/discussions/:threadId/posts`
   - `GET  /api/v1/discussions/:threadId/posts?limit=&cursor=`
   - `PUT  /api/v1/discussions/:threadId/close`
7. `server.ts`: instantiate `DrizzleDiscussionRepository(poolManager)` + the use cases and
   extend `RouteDependencies`.

## 6. Constraints & gotchas
- Do NOT auto-create a thread inside node/proposal creation in this task (US-02/US-03 tie-in is
  tracked separately); just wire what exists.
- Post ordering: chronological (ASC) for conversation readability.
- Return plain DTOs; convert `AuthorHash` to string.
- The `discussion_posts.parentPostId` self-reference may be `null` for top-level comments.

## 7. Acceptance criteria
- [ ] `routes.ts` registers the five `/discussions` routes behind the guard chain.
- [ ] `server.ts` wires the discussion repo + use cases.
- [ ] Listing posts for an unknown thread → 404 `ERR_THREAD_NOT_FOUND`.
- [ ] Closing a thread as a non-creator → 403; as the creator → `CLOSED`.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -n "'/api/v1/discussions" apps/api/src/infrastructure/http/routes.ts
```

## 9. Definition of done / handoff
- Build passes; thread/post reads and close work; the vertical is fully wired.
- Mark `TASK-14` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Post soft-delete endpoint, per-post voting wiring (TASK-15), and SSE live updates.
