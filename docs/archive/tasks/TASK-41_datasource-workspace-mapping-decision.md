# TASK-41 — Data-Source → Workspace Mapping: Decision + Shared-Types Contract

> **Batch:** Phase 1T.4 (Ingestion Contract) · **Depends on:** none · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
The AI workers must POST nodes as bots (US-07), but **nothing models which workspace a given
institutional data source writes to**. `docs/modules/modules_05_ai_worker_extractor.md` §3 has the
Extractor forward `X-Workspace-ID: record.workspace_id` taken straight from the queue payload:

```python
class RawSourceRecord(BaseModel):
    source_id: str
    channel_name: str
    raw_content: str
    workspace_id: str
```

There is no `sources` table in `packages/database`, no API route that resolves `source_id →
workspace`, and no registry of channel types. The worker is trusted to pick any workspace. This is
the Phase-2 blocker behind user concerns #2 and #3.

## 2. Objective
Decide **where the mapping lives** and freeze the contract as shared types + docs, **without**
building the Phase-2 tables/routes yet (so Phase 2 starts from a decision, not a guess).

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: every relative import ends in `.js`.
- `pnpm turbo run build` must pass.
- Shared vocabulary lives in `@vozlab/shared-types`.
- One worker codebase, behavior **per data source**, scoped by workspace, inside the tenant (one
  worker per source is rejected — see the decision).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `packages/shared-types/src/schemas/ingestion.schema.ts` |
| Edit | `packages/shared-types/src/index.ts` (export) |
| Edit | `docs/modules/modules_05_ai_worker_extractor.md` (new "Source → Workspace mapping" section) |
| Edit | `docs/00_ARCHITECTURE_OVERVIEW.md` (one paragraph in the workers section, if present) |
| Edit | `EXECUTION_PLAN.md` (add the Phase-2 milestone reference / Deferred note) |

## 5. Step-by-step instructions
1. **Record the decision** in `modules_05` (a short `## Source → Workspace mapping` section):
   - The mapping is **owned by the API**, not the worker. A per-tenant registry
     (`meta.data_sources`) maps `source_id → { workspace_id, connector_type, behavior_profile,
     bot_agent_type }`.
   - The ingestion gateway enqueues raw content + `source_id` **only**; the API resolves the
     workspace for that `source_id` (or the worker calls a resolution endpoint before posting).
   - Rationale: the API already owns tenancy, workspaces and the ontology; a worker must never be
     able to address an arbitrary workspace. Alternatives rejected: (i) envelope-carried
     `workspace_id` (today — trusted, unauditable), (ii) one worker per workspace (ops cost).
   - Behavior is a function of the **source/connector type** (e.g. meeting-minutes vs survey), not of
     the workspace or tenant: one worker codebase, `behavior_profile` per source.
2. **Freeze the contract** in `packages/shared-types/src/schemas/ingestion.schema.ts`:
   ```ts
   export const ConnectorTypeSchema = z.enum([
     'MINUTES', 'SURVEY', 'INBOX', 'OPEN_COMMENT',
   ]);
   export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

   /** Behavior profile selected by the connector type (one worker, many profiles). */
   export const BehaviorProfileSchema = z.enum(['BATCH', 'STREAM']);
   export type BehaviorProfile = z.infer<typeof BehaviorProfileSchema>;

   /** Envelope produced by the ingestion gateway and consumed by the Extractor. */
   export const RawSourceRecordSchema = z.object({
     sourceId: z.string().min(1),
     connectorType: ConnectorTypeSchema,
     channelName: z.string().min(1),
     rawContent: z.string().min(1),
     // NOTE: no workspaceId — the API resolves it from the source registry.
   });
   export type RawSourceRecord = z.infer<typeof RawSourceRecordSchema>;
   ```
   Export every symbol from `index.ts`.
3. State explicitly in `modules_05` that `RawSourceRecord` carries **no** `workspace_id`, so the
   Phase-2 worker cannot trust one; the registry/resolution route is a Phase-2 deliverable.
4. Add the Phase-2 reference to `EXECUTION_PLAN.md`: the `meta.data_sources` table + the resolution
   route belong to MILESTONE-2.x (Extractor), not to this batch.

## 6. Constraints & gotchas
- Do **not** create the `meta.data_sources` table or a migration — that is Phase 2.
- Do **not** add an API route — decision + types + docs only.
- Do **not** change `BatchCreateNodeSchema` (TASK-16) or the agent JWT contract (TASK-21).
- Keep the schema field names camelCase (they are transport types); the Python worker will map its
  snake_case fields to them.
- `bot_agent_type` in the registry must reuse `AgentTypeSchema` (TASK-21), never a new enum.

## 7. Acceptance criteria
- [ ] `ingestion.schema.ts` is exported from `@vozlab/shared-types` and compiles.
- [ ] `modules_05` contains the mapping decision, the rejected alternatives, and the statement that
      the worker never chooses a workspace.
- [ ] `EXECUTION_PLAN.md` points the `data_sources` table + resolution route at Phase 2.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "RawSourceRecordSchema\|ConnectorTypeSchema\|BehaviorProfileSchema" packages/shared-types/src/index.ts
grep -n "Source → Workspace\|data_sources" docs/modules/modules_05_ai_worker_extractor.md
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-41` `[x]` in `TODO.md` with a one-line result note and the
  chosen decision (API-owned registry). TASK-42 depends on this wording.

## 10. Out of scope
- The `meta.data_sources` table, migration, worker code, resolution route (Phase 2).
- PII sanitization rules (already in `modules_05`).
