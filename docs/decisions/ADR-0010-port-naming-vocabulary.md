# ADR-0010: Port naming vocabulary

- Status: Accepted
- Date: 2026-10-19

## Context

The repository ports had the same concept under several names: `softDelete` vs `softDeletePost`, `findById` vs `findByIdInWorkspace` vs `findPostById`, `update` vs `updateThreadStatus`, and `applyScoreDelta` vs `applyDelta` vs `applyClassDelta`. A new adapter had no way to know which suffix implied a security scope and which was only a filter.

## Decision

Repository ports use one grammar, documented in `modules_02` §6.8:

| Name | Contract |
| --- | --- |
| `findById` / `findByKey` | Load one object by primary key / natural key; absent -> `null`. |
| `findByIdInWorkspace` | Security-scoped load: the object must belong to the request workspace or it reads as missing. Runs before authorization. |
| `listByWorkspace` | Paginated collection filtered to the caller's workspace. |
| `listAllByWorkspace` | Unpaginated collection filtered to the caller's workspace. |
| `save` | Insert a new entity. |
| `update` | Persist a mutated entity or its changed fields. |
| `softDelete` | Stamp `deleted_at` on the port's aggregate. Exactly one per port. |
| `apply*Delta` | Apply a typed delta to an aggregate (`applyDelta`/`applyClassDelta` for approved proposals, `applyScoreDelta` for vote counters). |
| `existsInWorkspace` | Boolean existence predicate; not named `find` because it does not return an object. |

`...InWorkspace` marks a security boundary (the object must belong to the request workspace); `...ByWorkspace` is a plain workspace filter. A name is `find*` only when it returns one nullable object. TASK-39 applied the bounded renames: `softDeletePost -> softDelete`, `updateThreadStatus -> update`, `findByWorkspace -> listByWorkspace` (paginated) and `findByWorkspace -> listAllByWorkspace` (unpaginated).

## Consequences

### Positive

- A method name states whether workspace isolation is enforced, without reading the implementation.
- One soft-delete verb per aggregate makes single-writer reviews mechanical.
- New ports can be checked against a short table instead of inventing a local convention.

### Negative / costs

- Some names are long (`findByIdInWorkspace`, `listAllByWorkspace`), and the distinction between `...InWorkspace` and `...ByWorkspace` must be learned.
- The renames created a one-time diff and touched test fakes.
- The convention is documentation-enforced; nothing in the compiler prevents a new method from violating it.

## Links

- `docs/archive/spec-v1/modules/modules_02_backend_fastify_guide.md` §6.8
- `apps/api/src/domain/ports/`
- `.claude/reviews/REVIEW-2026-10-17_phase-1s.md` M-14, concern C6
- `.claude/tasks/TASK-39_port-naming-convention.md`
