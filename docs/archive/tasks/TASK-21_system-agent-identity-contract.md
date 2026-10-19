# TASK-21 — System-Agent (AI Worker) Identity Contract

> **Batch:** Phase 1S.2 (Identity) · **Depends on:** TASK-19, TASK-20 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
The three AI workers (`docs/00_ARCHITECTURE_OVERVIEW.md` §2) must call the API as bots
(`US-07`): they POST nodes and proposals, and are exempt from *workspace membership* (they are
platform actors, not workspace members). The skeleton already supports this partially:
`AuthGuard` matches a `type` claim against `AGENT_EXTRACTOR|AGENT_RELACIONADOR|AGENT_CONSOLIDADOR`
and `TenantWorkspaceGuard` skips the membership query when `req.isSystemAgent`.

Gaps: the allowlist is duplicated knowledge living only in `AuthGuard`; an agent token without an
`authorHash` falls into the placeholder collision fixed by TASK-20; nothing documents the worker
contract; and there is no `SYSTEM_AGENT` user row for audit.

## 2. Objective
Define, implement and document a single, typed worker identity contract so the Python workers can
authenticate deterministically against the same REST endpoints as humans.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: relative imports end in `.js`.
- `pnpm turbo run build` must pass.
- Shared vocabulary lives in `@vozlab/shared-types`; never restate the same literals in two layers.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `packages/shared-types/src/**` (new `agent.schema.ts` or extend `errors`) |
| Edit | `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts` |
| Edit | `apps/api/src/infrastructure/http/middlewares/TenantWorkspaceGuard.ts` (comments only) |
| Edit | `packages/database/scripts/dev-identities.ts` (agent fixture, if not done in TASK-19) |
| Edit | `docs/modules/modules_02_backend_fastify_guide.md` §3 (worker contract) |
| Edit | `docs/system/system_02_use_cases_and_actors.md` §US-07 (pointer to the contract) |

## 5. Step-by-step instructions
1. In `@vozlab/shared-types` add:
   ```ts
   export const AgentTypeSchema = z.enum(['AGENT_EXTRACTOR', 'AGENT_RELACIONADOR', 'AGENT_CONSOLIDADOR']);
   export type AgentType = z.infer<typeof AgentTypeSchema>;
   ```
   Export it from `index.ts`.
2. `AuthGuard`: replace the local `AGENT_TYPES` set with `AgentTypeSchema.options` (or a derived
   `ReadonlySet`). Behaviour:
   - `payload.type` present and in the allowlist → `req.isSystemAgent = true`, `req.agentType = type`.
   - `payload.type` present but **not** allow-listed → `401 ERR_INVALID_TOKEN` (never silently treat
     an unknown bot as a human).
   - For an agent, `authorHash` is **required** (per-agent, deterministic): if missing and `sub` is
     absent too → 401. Reuse the TASK-20 resolver so the hash is stable per `sub`.
3. Keep `TenantWorkspaceGuard` behaviour (agents bypass membership) but extend the comment to state
   the contract: an agent must still send `X-Workspace-ID` and its `tid` must resolve in the router DB.
4. Document the contract in `docs/modules/modules_02` §3 with a small table: claim → required →
   meaning (`sub`, `tid`, `jti`, `authorHash`, `type`), plus a note that agents use
   `POST /api/v1/nodes` and `POST /api/v1/proposals` (never direct DB writes).
5. Add a one-line pointer in `system_02` US-07 to that contract.

## 6. Constraints & gotchas
- Agents are NOT workspace members: do not add them to `auth.workspace_memberships`.
- Do not grant agents moderator/admin roles implicitly; role-gated actions stay role-gated.
- `TASK-19`'s `--as agent` mint path must produce a token that satisfies this contract; if you change
  the required claims, update that script in the same change.

## 7. Acceptance criteria
- [ ] `AgentTypeSchema` is exported from `@vozlab/shared-types` and used by `AuthGuard`.
- [ ] An agent token with a valid `type` + `authorHash` + `tid` reaches a handler (membership skipped).
- [ ] An unknown `type` value → 401 `ERR_INVALID_TOKEN`.
- [ ] The worker contract is documented in `modules_02` and referenced from `system_02`.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
# with the API running and a seeded tenant:
# TOKEN=$(pnpm --filter @vozlab/database db:mint-token -- --as agent | tail -1)
# curl -s -X POST localhost:3000/api/v1/nodes -H "Authorization: Bearer $TOKEN" \
#   -H "X-Workspace-ID: 33333333-3333-4333-8333-333333333333" -H 'content-type: application/json' \
#   -d '{"typeKey":"Problem","title":"agent-created"}'
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-21` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- The Python workers themselves (Phase 2). This task only fixes the API-side contract they rely on.
