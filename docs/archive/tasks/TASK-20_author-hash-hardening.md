# TASK-20 — Author-Hash Hardening (kill `'unknown'`/`'anonymous'`, configurable salt)

> **Batch:** Phase 1S.2 (Identity) · **Depends on:** TASK-18 · **Size:** M
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
Pseudonymity is central to the design (FR-07, NFR-07): the public identity is
`author_hash = SHA-256(identity + institutional salt)`. Today three defects break it:

1. `AuthGuard` sets `authorHash: payload.authorHash ?? 'unknown'`.
2. `getRequestContext` falls back to `'anonymous'` for both `userId` and `authorHash`.
3. Nine call sites hardcode the salt literal `'default-salt'`
   (`grep -rn "default-salt" apps/api/src`).

Consequences: a token without an `authorHash` claim maps **every** caller to the same derived
hash → maintainer-only approval (FR-12) can be satisfied by anyone, and the vote uniqueness
constraint (FR-14) is shared across users.

## 2. Objective
Make identity resolution deterministic and unforgeable: require a subject, derive the author hash
from a **configured** institutional salt, and never fall back to a shared placeholder.

## 3. Project conventions (non-negotiable)
- **pnpm only.** **NodeNext**: relative imports end in `.js`.
- `pnpm turbo run build` must pass.
- `domain/` must not import Fastify/Drizzle/pg; the salt is infrastructure config, injected.
- Secrets come from `env.ts` (Zod-validated at startup), never hardcoded.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `apps/api/src/shared/config/env.ts` (add `AUTHOR_HASH_SALT`) |
| Edit | `.env.example` (add the new var) |
| Edit | `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts` |
| Edit | `apps/api/src/infrastructure/http/controllers/requestContext.ts` |
| Edit | the 6 use cases + controllers that pass `'default-salt'` |
| Edit | `apps/api/src/domain/value_objects/AuthorHash.ts` (only if needed) |

## 5. Step-by-step instructions
1. Add to `env.ts`: `AUTHOR_HASH_SALT: z.string().min(16, 'AUTHOR_HASH_SALT must be at least 16 chars')`.
   Add the same line to `.env.example` with a dev value and a comment that it is the
   **institutional** salt and rotating it re-keys every pseudonym.
2. In `AuthGuard`, after `jwt.verify`:
   - If `!payload.sub` (missing/empty string) → `401 ERR_INVALID_TOKEN` (do not proceed).
   - Set `req.user = { userId: payload.sub, authorHash: resolveAuthorHash(payload.authorHash, payload.sub) }`.
   - Delete the `?? 'unknown'` fallback.
3. Add a single resolver in `apps/api/src/application/` (e.g.
   `application/services/resolveAuthorHash.ts`) exporting
   `resolveAuthorHash(raw: string | undefined, subject: string): AuthorHash` that wraps
   `AuthorHash.fromRawOrIdentity(raw || subject, env.AUTHOR_HASH_SALT)`. The `AuthGuard` and every
   use case use **this** helper — no literal salt anywhere else.
4. Replace all 9 `AuthorHash.fromRawOrIdentity(<x>, 'default-salt')` call sites with the helper.
   `grep -rn "default-salt" apps/api/src` must return **zero** matches afterwards.
5. In `requestContext.ts`, make `userId`/`authorHash` **required** strings (no `'anonymous'`
   fallback): if the guards did not run, return `null` (the guards guarantee presence on every
   protected route).
6. In every controller, when `getRequestContext(req)` returns `null`, respond
   `401 ERR_INVALID_TOKEN` (not `ERR_MISSING_WORKSPACE_HEADER`, which describes a different
   failure). Update the ~8 handlers consistently.
7. Update `docs/system/system_04` (or `modules_02`) with one sentence: the salt is per-institution
   config (`AUTHOR_HASH_SALT`), and tokens must carry `sub`; `authorHash` is derived if absent.

## 6. Constraints & gotchas
- `AuthorHash.fromRawOrIdentity` treats a valid 64-hex value as already-hashed — keep that so a
  token that *does* carry `authorHash` (e.g. minted by TASK-19) is preserved verbatim.
- Do not log raw token payloads or the salt.
- Existing seeded `authorHash` values must keep working: a token with an `authorHash` claim must be
  used **as-is** (no re-hash), otherwise TASK-19's maintainer identity breaks.

## 7. Acceptance criteria
- [ ] `grep -rn "default-salt" apps/api/src` → no matches.
- [ ] `grep -rn "'unknown'\|'anonymous'" apps/api/src` → no identity fallbacks.
- [ ] A token without `sub` → 401 `ERR_INVALID_TOKEN`.
- [ ] A token without `authorHash` but with `sub` → deterministic hash derived from the configured salt.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
grep -rn "default-salt" apps/api/src || echo "clean"
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; mark `TASK-20` `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- The `SYSTEM_AGENT` allowlist / worker contract (TASK-21); the real OIDC claim extraction
  (deferred auth milestone).
