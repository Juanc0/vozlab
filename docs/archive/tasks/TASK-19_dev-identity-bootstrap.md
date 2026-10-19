# TASK-19 — Dev Identity Bootstrap (multi-role seed + dev JWT minting)

> **Batch:** Phase 1S.2 (Identity) · **Depends on:** TASK-18, TASK-17 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
There is no way to obtain a token: no `/auth/*` endpoint exists, no IdP is reachable locally, and
`packages/database/scripts/seed-dev.ts` provisions only **one** user (`Dev Maintainer`, `ADMIN`).
Result: no one can exercise the API (TASK-17 AC #2/#3 stayed unverified), and role-gated flows
(proposal `auto-apply`, ontology activation) cannot be tested at all.

The AuthGuard expects a HS256 JWT signed with `JWT_SECRET` carrying:
`sub`, `tid` (must equal the seeded `tenants.oidc_tenant_id`), `jti`, and `authorHash`
(a 64-char hex SHA-256). `X-Workspace-ID` must carry the seeded workspace UUID.

## 2. Objective
Provision several dev users with distinct roles **and** add a dev-only script that mints a valid
JWT for any of them, so every endpoint can be tested locally without an identity provider.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: relative imports end in `.js`.
- `pnpm turbo run build` must pass.
- Dev-only code. Never wire the seed or the mint script into app startup, `db:migrate` or CI.
- Idempotency: fixed UUIDs + `onConflictDoNothing()`; running the seed twice must not duplicate rows.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Create | `packages/database/scripts/dev-identities.ts` |
| Edit | `packages/database/scripts/seed-dev.ts` |
| Create | `packages/database/scripts/mint-dev-token.ts` |
| Edit | `packages/database/package.json` (scripts + devDeps) |

## 5. Step-by-step instructions
1. Create `packages/database/scripts/dev-identities.ts` exporting a single frozen fixture object
   with **fixed** UUIDs, `sub`, `authorHash` (sha256 of a stable string), `systemRole` and
   workspace role for:
   - `maintainer` — `systemRole: 'USER'`, membership `ADMIN` (author of seeded ontology).
   - `moderator` — `systemRole: 'MODERATOR'`, membership `MODERATOR`.
   - `member`   — `systemRole: 'USER'`, membership `MEMBER`.
   - `agent`    — `systemRole: 'SYSTEM_AGENT'`, JWT `type: 'AGENT_EXTRACTOR'`, **no** membership.
   Export the workspace UUID, the tenant slug/`oidc_tenant_id` (`sabana`) and helper
   `authorHashFor(name)` = `createHash('sha256').update(`dev-${name}`).digest('hex')`.
   Keep the existing `maintainer` values identical to today's seed (do not re-key it).
2. Refactor `seed-dev.ts` to import the fixtures and insert, idempotently: the workspace, all four
   `auth.users` rows, and the three `auth.workspace_memberships` rows. Keep the existing ontology
   seeding (Problem/Idea/Resource, title/description, RELATES_TO) unchanged. Print a table of
   `role -> sub -> authorHash` plus the `X-Workspace-ID` at the end.
3. Create `packages/database/scripts/mint-dev-token.ts`:
   - Usage: `pnpm --filter @vozlab/database db:mint-token -- --as maintainer`
     (`--as` one of `maintainer|moderator|member|agent`; default `maintainer`).
   - Read `JWT_SECRET` from `process.env`; if missing or < 32 chars, print a clear error and exit 1.
   - Sign HS256 with `jsonwebtoken`, expiry `12h`, claims:
     `{{ sub, tid: 'sabana', jti: randomUUID(), authorHash, type? }}` (`type` only for `agent`).
   - Print the token and the exact `curl` headers to use:
     `Authorization: Bearer <token>` and `X-Workspace-ID: <WORKSPACE_ID>`.
   - Exit non-zero with a helpful message if `jsonwebtoken` is unavailable.
4. In `packages/database/package.json` add:
   - scripts: `"db:mint-token": "NODE_OPTIONS='--import tsx' tsx scripts/mint-dev-token.ts"`.
   - devDependencies: `jsonwebtoken` and `@types/jsonwebtoken` (versions already present in
     `apps/api/package.json` — reuse those ranges). Then `pnpm install`.

## 6. Constraints & gotchas
- Do **not** commit a token; the script prints it at runtime only.
- The `authorHash` printed by the seed must equal the one embedded in the minted token, otherwise
  maintainer-only authorization (FR-12) will reject the dev user.
- `tid` must be `sabana` to match `seed-dev.ts` (`tenants.oidc_tenant_id`).
- If Postgres is not running, the seed must fail with a clear message and non-zero exit (it already does).

## 7. Acceptance criteria
- [ ] `pnpm --filter @vozlab/database db:seed:dev` twice in a row: row counts stable, prints 4 users / 3 memberships.
- [ ] `pnpm --filter @vozlab/database db:mint-token -- --as moderator` prints a decodable JWT whose
      `tid === 'sabana'` and whose `authorHash` matches the seeded moderator.
- [ ] `--as agent` yields a token with `type === 'AGENT_EXTRACTOR'` and no membership needed.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
docker compose up -d && pnpm --filter @vozlab/database db:migrate
pnpm --filter @vozlab/database db:seed:dev
pnpm --filter @vozlab/database db:seed:dev
pnpm --filter @vozlab/database db:mint-token -- --as maintainer
```
Decode the printed token (e.g. `node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" <token>`).

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-19` `[x]` in `TODO.md` with a one-line result note
  including the seeded workspace UUID.

## 10. Out of scope
- The real OIDC flow (`/auth/login|callback|logout`) and `event_codes` / `/auth/event-join`
  (tracked deferred in `EXECUTION_PLAN.md`). This task is **dev-only** token minting.
