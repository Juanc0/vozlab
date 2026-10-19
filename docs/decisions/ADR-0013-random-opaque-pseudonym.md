# ADR-0013: Pseudonymity uses a random opaque per-user pseudonym, not a salt

- Status: Accepted
- Date: 2026-10-19
- Supersedes: the deferred per-tenant, versioned `AUTHOR_HASH_SALT` milestone (`docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Deferred, TASK-37) and the salt-based derivation in `docs/archive/spec-v1/system/system_04` §3.1.1 and `docs/archive/spec-v1/modules/modules_02` §3.3.

## Context

The previous design defined `author_hash = SHA-256(identity + institutional salt)`. The salt was a deployment-global secret, and the target model was a per-tenant, versioned salt with `hash_version`/`salt_id`, dual-read and backfill. That target added a secret to manage and made rotation a data migration, because the hash is stored on rows and compared for authorization (FR-12) and vote uniqueness (FR-14/15).

The salt also did not protect against full-database access: `auth.users` maps identity to `author_hash` in the same database, so a reader who can reach the graph can also reach the mapping. NFR-07 only requires that the visible graph not expose personal data; it does not require the pseudonym to be derived.

## Decision

`author_hash` is a random opaque 64-hex value generated when the user account is created. It is stored on `auth.users.author_hash` and carried verbatim as the `authorHash` JWT claim. `AuthGuard` requires `sub` and a valid 64-hex `authorHash`, and never derives the pseudonym. There is no salt and no `AUTHOR_HASH_SALT`; the salt reader (`resolveAuthorHash`) is removed.

The auth flow must look up or issue the pseudonym at login rather than derive it statelessly. Dev fixtures remain deterministic (`sha256("dev-<name>")`) so seeded rows, ontology ownership and minted tokens match without a lookup.

NFR-07 keeps its intent (no PII in the graph); its wording changes from "SHA-256 of the identity with institutional salt" to "random opaque pseudonym". The per-tenant `hash_version`/`salt_id`/dual-read/backfill milestone is cancelled, not deferred.

## Consequences

### Positive

- The pseudonym is unconditionally unlinkable from the identity without reading `auth.users`; it is not a deterministic function of a guessable subject.
- No secret to store, rotate or leak, and no config-dependent re-keying.
- Removes the Phase 1T failure modes: global salt, unsafe rotation, placeholder guard and cross-tenant salt sharing.
- Token verification is simpler and has no salt dependency.

### Negative / costs

- The pseudonym must be looked up or issued at login; it is not statelessly derivable.
- Account creation and any import must generate a unique random value and persist it before minting a token.
- Full database access still links `auth.users` to graph rows; pseudonymity protects the graph, not the database.
- A deployment that already stored salt-derived hashes would need a one-time re-key/backfill if it were kept.

## Links

- `apps/api/src/infrastructure/http/middlewares/AuthGuard.ts`
- `apps/api/src/domain/value_objects/AuthorHash.ts`
- `packages/database/src/schema/tenant.auth.schema.ts` (`users.authorHash`)
- `packages/database/scripts/dev-identities.ts`, `mint-dev-token.ts`
- `docs/archive/spec-v1/system/system_01_functional_and_non_functional_requirements.md` NFR-07
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Deferred (superseded entry)
