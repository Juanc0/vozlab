# TASK-42 — Fix the Extractor Spec Drift (`modules_05`)

> **Batch:** Phase 1T.4 (Ingestion Contract) · **Depends on:** TASK-41 · **Size:** S
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`docs/modules/modules_05_ai_worker_extractor.md` contradicts the implemented API contract and its
own §1:

| Line | Doc says | Reality |
| --- | --- | --- |
| `type_key: str = Field(default="problem")` | lower-case `problem` | The seeded/validated ontology key is `Problem`; `CreateNodeUseCase` rejects an unknown `typeKey` with 422. |
| `_send_to_fastify` headers | `Authorization: Bearer {api_key}`, `X-Workspace-ID` | The bot identity is the agent JWT (TASK-21, `modules_02 §3.2`); `api_key` is not how bots authenticate. |
| §3 code | `record.workspace_id` | TASK-41 removes `workspace_id` from the envelope (API-owned mapping). |
| §1 vs §3 | §1 describes a Redis root-entity cache + serverless gateway + dedup | §3 has no cache and no `x-correlation-id`. |

## 2. Objective
Align the Extractor spec with the implemented contract so the Phase-2 worker is written against
truth, not the stale sample.

## 3. Project conventions (non-negotiable)
- Docs are English; code/comments English.
- Do not change application code in this task.
- `pnpm turbo run build` must pass (docs-only, but run it).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `docs/modules/modules_05_ai_worker_extractor.md` |

## 5. Step-by-step instructions
1. Change the sample `RawSourceRecord`/`ExtractedNodePayload` to the TASK-41 contract:
   - `RawSourceRecord` carries `source_id`, `connector_type`, `channel_name`, `raw_content` — **no**
     `workspace_id`;
   - `type_key` default must be a real ontology key (use `"Problem"`), and the doc must state it is
     validated against the workspace ontology (FR-06);
   - the POST bodies must match `CreateNodeSchema` / `BatchCreateNodeSchema` (TASK-16).
2. Rewrite `_send_to_fastify` to the agent contract:
   - obtain the bot JWT (claims `sub`/`tid`/`jti`/`authorHash`/`type = AGENT_EXTRACTOR`) — point at
     `modules_02 §3.2` instead of an `api_key`;
   - send `Authorization: Bearer <bot-jwt>`, `X-Workspace-ID: <resolved>`,
     `x-correlation-id: <reqId>`;
   - state that the workspace is resolved from the source registry (TASK-41), not from the payload.
3. Reconcile §1 and §3: either delete the Redis-cache/dedup paragraph from §1 or mark it as a
   **Phase-2 planned** behavior, and say which. Do not leave two contradictory descriptions.
4. Fix the "Write Isolation" guarantee (§4) to reference the agent identity and the batch/pagination
   contract (`BatchCreateNodeSchema`, 1..1000 per call) if relevant.

## 6. Constraints & gotchas
- Do **not** invent endpoints that do not exist (`/api/v1/ingest/...` is Phase 2). Use
  `POST /api/v1/nodes` and `POST /api/v1/proposals` (TASK-21).
- Keep the Python snippet runnable-looking; it is illustrative documentation.
- Do **not** touch `modules_02 §3.2` (TASK-21 owns it) — link to it.

## 7. Acceptance criteria
- [ ] `modules_05` no longer contains `default="problem"` or a bare `api_key` bearer.
- [ ] The envelope has no `workspace_id`.
- [ ] §1 and §3 describe one behavior (or §1 is explicitly marked "planned").
- [ ] The bot JWT + `X-Workspace-ID` + `x-correlation-id` headers are shown.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
grep -n "problem\|api_key\|workspace_id" docs/modules/modules_05_ai_worker_extractor.md
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-42` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Writing the worker (Phase 2).
- The Extract API routes.
