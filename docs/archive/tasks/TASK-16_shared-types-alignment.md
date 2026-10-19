# TASK-16 — `shared-types` Alignment (Contracts, Error Codes, Batch Schema)

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-06, TASK-10, TASK-15 · **Size:** S–M
> **Self-contained:** yes.

## 1. Context
`packages/shared-types` is the single source of truth for DTOs, Zod schemas and the HTTP error
dictionary used by the API (and later by the SvelteKit PWA). After the remediation batch, a few
contracts are still loose or missing:

- `interaction.schema.ts` declares a `value` field that `CastVoteUseCase` ignores (the delta is
  derived from `interactionType`). This is ambiguous for consumers.
- `node.schema.ts` `typeKey` has no `.min(1)`.
- There is no **batch** node-ingestion schema, but the Extractor worker (`docs/modules/
  modules_05`) is described as sending nodes to the API (potentially batched).
- Some API-side query schemas (nodes list, subgraph) were added in TASK-10/11 — confirm they are
  exported.
- `z.record(z.any())` appears in a few places; prefer `z.record(z.unknown())` for inputs.
- New error codes (`ERR_UNMET_AUTO_APPLY_CRITERIA`, `ERR_AUTHORIZATION_FAILED`) were added in
  TASK-06 — verify they are present and typed.

## 2. Objective
Make the shared contracts unambiguous and complete so the API and future clients compile against
one consistent surface.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: every relative import ends with `.js`.
- `shared-types` is a pure workspace package (Zod + types only; no runtime deps on Fastify/Drizzle).
- Every new schema/type must be exported from `packages/shared-types/src/index.ts`.
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/shared-types/src/schemas/interaction.schema.ts` |
| Edit | `packages/shared-types/src/schemas/node.schema.ts` |
| Create | `packages/shared-types/src/schemas/batch.schema.ts` (batch node ingestion) |
| Edit | `packages/shared-types/src/errors/http-errors.ts` (verify only) |
| Edit | `packages/shared-types/src/index.ts` |

## 5. Step-by-step instructions
1. `interaction.schema.ts`: remove the misleading `value` field from `CastVoteSchema`, **or**
   keep it but document (via a comment) that it is derived server-side and ignored on input — do
   **not** leave both a field and silent ignoring without explanation. Prefer removing it and
   documenting that the delta comes from `interactionType`. Update `CastVoteUseCase`/controller
   if they referenced `value` (they should not).
2. `node.schema.ts`: change `typeKey` to `z.string().min(1).max(100)` and use
   `z.record(z.unknown())` for `attributes` in input schemas.
3. Create `batch.schema.ts` with `BatchCreateNodeSchema = z.object({ nodes: z.array(CreateNodeSchema).min(1).max(1000) })`
   and `export type BatchCreateNodeInput = z.infer<...>`. (No endpoint is implemented in this
   batch — this only defines the contract used by the Extractor worker later. Note that in a comment.)
4. `errors/http-errors.ts`: confirm `ERR_UNMET_AUTO_APPLY_CRITERIA` (422) and
   `ERR_AUTHORIZATION_FAILED` (403) exist. If not, add them.
5. `index.ts`: export `./schemas/batch.schema.js` and make sure the node/list/subgraph query
   schemas from TASK-10/11 are exported.
6. Grep for `z.record(z.any())` across `packages/shared-types` and replace input usages with
   `z.record(z.unknown())`.

## 6. Constraints & gotchas
- Removing `CastVoteSchema.value` is a **contract change**: update `apps/api` call sites that may
  read it. `CastVoteUseCase` derives the delta itself, so it should already be safe — verify.
- Do not add runtime logic to `shared-types`; schemas and constants only.
- Keep `ERROR_CODES` as `as const` with the `{ status, message }` shape (TASK-06 depends on it).

## 7. Acceptance criteria
- [ ] `CastVoteSchema` no longer silently ignores a `value` field (removed or documented).
- [ ] `CreateNodeSchema.typeKey` requires at least 1 character.
- [ ] `BatchCreateNodeSchema` exists and is exported.
- [ ] All new query schemas are exported from `index.ts`.
- [ ] `pnpm turbo run build` passes for all packages.

## 8. Verification commands
```bash
pnpm turbo run build
grep -rn "z.record(z.any())" packages/shared-types/src && echo "review remaining usages"
grep -n "BatchCreateNodeSchema" packages/shared-types/src/index.ts
```

## 9. Definition of done / handoff
- Build passes; contracts are unambiguous and exported.
- Mark `TASK-16` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Implementing the batch ingestion endpoint, and generating OpenAPI clients.
