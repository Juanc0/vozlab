# 09 — Security review

> **Knowledge doc — standing audit baseline.** Re-verified 2026-10-29: S-01/S-07/S-14 fixed; **S-02/03/04/05/12/15 still open** (tracked in ROADMAP). Original severity scoring assumed the 2026-10-23 pre-deployment state.

Scope: the repository as it stands on 2026-10-23, read and partly exercised. No penetration test was run and no
deployed environment exists, so every finding is about the code, the configuration or the design, not about a
running system. Severity is a judgment of impact times likelihood in the **next stage** (demo, pilot, deployment).

## 1. The short verdict

The security foundations are **above the usual level** for a project of this age: a strict guard order, cross-
workspace reads that answer 404, PKCE with single-use state and nonce, rotating refresh tokens with reuse detection,
hashed storage of refresh tokens and event codes, HttpOnly and SameSite cookies, no password storage, random
pseudonyms, parameterised queries, no HTML rendering of user content, and a read-only database role for agents.
The weaknesses are concentrated in **deployment and configuration**, in **one identity-trust design**, and in
**data retention for AI inputs**. Those are fixable in weeks, and most of the work is small.

## 2. Findings

Severity: **Critical** blocks deployment or exposes tenants; **High** is exploitable or blocks a credible demo or
pilot; **Medium** weakens a control or grows with use; **Low** is hygiene.

| ID | Severity | Finding | Evidence | Fix (short) | Effort |
| --- | --- | --- | --- | --- | --- |
| **S-01** | High (Critical behind a load balancer) | No `trustProxy`. Client IP is the proxy's IP, so per-IP limits on login, refresh and event-join are shared by everyone. The same wrong IP reaches the logs. | `server.ts` `Fastify({...})` with no `trustProxy`; rate limiter keys on `req.ip`. | Set `trustProxy` to the exact number of trusted hops, or to the load balancer's network range. Never trust arbitrary `X-Forwarded-For`. Test with a spoofed header. | XS |
| **S-02** | High | A database password for the read-only `mcp_reader` role is committed in `opencode.json`. The file is tracked by git and the value is in history. | `opencode.json` line with `DATABASE_URI` containing the credential. `.env.example` says it must stay in sync. | Rotate the role's password now. Reference `{env:MCP_READER_URI}`, which the same file already does for the GitHub token. Remove the value from history if the repository is ever shared. | XS |
| **S-03** | High | Tenant database passwords are stored in plain text in `router.tenant_connections.password`. | `router.schema.ts`; ADR-0002 negative consequences. | Store a reference to a secrets manager (or use IAM database authentication), encrypt at rest, and give each tenant a database user that can reach only its own database. | M |
| **S-04** | High | One signing secret (`JWT_SECRET`, HS256) is shared by the API and every worker that mints tokens. Anyone holding it can mint a token for any user, in any tenant. The blast radius is every institution. | `apps/api` and worker settings; `docker-compose.yml` passes `JWT_SECRET` to three workers; ADR-0021 §3. | Move to asymmetric signing: the API alone holds the private key; workers hold no signing key and receive short-lived tokens from a narrow issuer. Keep HS256 for local development only, behind an explicit flag. | M–L |
| **S-05** | High (demo) | Compose publishes PostgreSQL (`postgres/postgres`), Redis (no password) and Ollama on all interfaces. | `docker-compose.yml` port mappings without a loopback address. | Bind to `127.0.0.1:` for every published port. Set a Redis password and a non-default database password via `.env`. Do not publish Ollama. | XS |
| **S-06** | Medium | No browser security headers. No Content-Security-Policy on the PWA, no HSTS, no frame or content-type policy. The API sets none either. | No CSP in `svelte.config.js`, `hooks.server.ts`, or `server.ts`. | SvelteKit `kit.csp` with nonces, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. HSTS at the edge. `@fastify/helmet` for the API. | S |
| **S-07** | Medium | Single-issuer identity validation (see `08` §4). Not a confidentiality flaw, but a trust configuration that will be changed under pressure in the first multi-institution deployment. | `OidcProviderClient.ts` | Decide before the second institution (`08`). | S–M |
| **S-08** | Medium | Redis outage makes the token blacklist fail open, so logout does not revoke a stolen access token. The rate limiter also fails open. | `runbook-ops.md`; `auth-and-tenancy.md` §11. | Accept for rate limiting. For sensitive routes (role changes, membership, approvals) consider failing closed on the blacklist check, and alarm on the Redis error rate. Keep the 15-minute access lifetime. | S |
| **S-09** | Medium | The authorisation `code` (and `state`) from the OIDC callback may appear in request logs, because the request URL with its query string is logged and the redaction list covers headers and body fields only. | `shared/logger/index.ts` redact paths; default request logging. [juicio: confirm with one log line] | Redact `req.query.code`, `req.query.state` or log the route template instead of the raw URL. The code is single-use and PKCE-protected, so impact is low; the hygiene is still required. | XS |
| **S-10** | Medium | The masking of personal data happens after raw records are written to Redis, and the stream is never trimmed. Personal data can persist there indefinitely. | `docs/components/extractor.md`; `runbook-ops.md` (no `MAXLEN`). | Mask at the publisher; set trimming and a retention period; encrypt the stream at rest in managed Redis. | S (trim) / M (edge masking) |
| **S-11** | Medium | Prompt injection from untrusted records into the Extractor and Relator. Validation limits the damage to proposals, but the model's free text is persisted and shown to people. | `06` §5; Relator writes `reason` into proposals and edge attributes. | JSON schema output, delimiters, detection and flagging, rendering as plain text (already the case), adversarial test set. | S–M |
| **S-12** | Medium | Dependency and image provenance is not controlled. Images use unpinned tags (`ollama/ollama:latest`, `python:3.12-slim`, `apache/age:release_PG18_1.8.0`). GitHub Actions are pinned by tag, not by commit. There is no Dependabot or Renovate configuration, no vulnerability audit in CI, and no SBOM. | `docker-compose.yml`, Dockerfiles, `.github/workflows/ci.yml`; `.github/` contains only `workflows`. | Pin images by digest. Pin Actions by commit SHA. Add Dependabot or Renovate, `pnpm audit` and `pip-audit` in CI, and an SBOM with an image scan before any deployment. | S |
| **S-13** | Medium | The CI workflow declares no `permissions:` block. The job token therefore has the repository's default permissions, which may be broader than needed. | `.github/workflows/ci.yml` (no `permissions` key). | Declare `permissions: contents: read` at the top level and widen per job only where needed. | XS |
| **S-14** | Medium | No audit trail for security-relevant actions: event codes created, memberships changed, roles granted, proposals approved by agents. | Absent; the logs are operational. | An append-only audit table in each tenant, written in the same transaction as the action. Needed for governance and any institutional review. | M |
| **S-15** | Medium | Agent identities can approve proposals on objects they authored, as far as the code shows. The maintainer check compares only the author hash, and the approve path does not exclude agent types. | `proposalAuthorization.ts` (`assertIsMaintainer`); `ApproveProposalUseCase` contains no agent check. [juicio: confirm with a test] | Exclude agent types from approval and rejection routes. Make the human steward the approver of agent-authored objects (`06` §12, `15` D-13). | S |
| **S-16** | Medium | Development-only tools are present in the same repository that produces deployable artefacts: the token minter, the seed, and the event-code CLI. The dev sign-in is guarded by a build flag, which is good. | `packages/database/scripts/`; `apps/web` dev sign-in. | Refuse to run seed and mint scripts when `NODE_ENV=production` or when the target host is not local. Keep them out of production images. | XS |
| **S-17** | Medium | Redis and PostgreSQL connections in development are not encrypted; in production they must be (TLS). | `.env.example`; compose. | Require TLS to managed Redis and PostgreSQL; enforce with configuration validation at startup. | XS (validation) |
| **S-18** | Low | Two JWT libraries are used (`jsonwebtoken` and `jose`). Each adds surface and a maintenance burden. | `apps/api/package.json`. | Consolidate on `jose`, which the OIDC path already uses. | S |
| **S-19** | Low | Refresh-token rows are cleaned opportunistically, so inactive users keep rows (hashed). | `domain-model.md` §9. | A scheduled cleanup job with a retention rule. | S |
| **S-20** | Low | The email-verified check accepts a token that omits the claim (intentional, because Entra does not always send it). | `auth-and-tenancy.md` §4. | Document the trade-off per provider; prefer a provider that always sends the claim, or require a verified domain for the institution. | XS |
| **S-21** | Low | Event-join consumes the code before the tenant transaction. A tenant failure burns one use. | ADR-0019. | Accepted trade-off; keep, and show the operator the used count. | — |
| **S-22** | Low | Pseudonymity is linkable and reversible by database administrators. | ADR-0013; `auth-and-tenancy.md` §10. | Accepted and documented. Address through access control and audit (S-14). | — |

## 3. What is sound (keep it, and test it)

| Control | Where | Why it matters |
| --- | --- | --- |
| Guard order: identity, then tenant, then workspace membership, then rate limit | `routes.ts`, guards | No handler runs before identity and membership are proven. |
| Cross-workspace objects answer 404 | ADR-0008 | The existence of an object in another workspace is not revealed. |
| Authorisation code flow with PKCE S256, single-use state, nonce and verifier in Redis | `OidcProviderClient.ts`; ADR-0018 | Replay and code-interception attacks fail. |
| ID token checks: signature by JWKS, issuer, audience, expiry, nonce, email verified | `OidcProviderClient.ts` | Standard, strict validation. |
| Refresh tokens: opaque, hashed at rest, rotated on use, family revoked on reuse | ADR-0018; `auth.refresh_tokens` | A leaked table yields no usable credentials; theft is detected on second use. |
| Cookies: `HttpOnly`, `SameSite=Lax`, path-scoped, `Secure` in production | `auth-and-tenancy.md` §11 | Limits XSS and cross-site replay. |
| Access token only in memory on the client | PWA `session.svelte.ts` | Reduces exposure to storage-based attacks. |
| No HTML rendering of user content. Svelte escapes by default; the only raw-markup component is limited to dictionary copy. | `RichText.svelte` comment; no `{@html}` in `apps/web/src` [run] | Closes the most common stored-XSS path. |
| Parameterised SQL through the ORM | Drizzle `sql` templates in repositories | No string-built queries found in the reviewed paths. |
| Input validation with Zod at every boundary | `packages/shared-types` | Unknown fields and wrong types are rejected. |
| Agents restricted by an allow-list of identity types; a dedicated embedding route for one type only | `AgentTypeSchema`; ADR-0020 | Unknown agent types are rejected, not downgraded. |
| Model output validated before any write | Relator and Extractor validators | A hallucinated identifier is a model failure, never a write. |
| Read-only MCP role for agent tooling, with no access to the router | `grant-mcp-reader`; `opencode.json` | Agents cannot write or reach the router through this path. |
| Redaction of authorisation headers, cookies, passwords and tokens in logs | `shared/logger/index.ts` | Prevents the most common secret leakage in logs. |
| Dev-only sign-in is excluded from production builds | ROADMAP 3.9 | Prevents a development shortcut reaching institutions. |
| No password storage at all | NFR-05 | Nothing to leak or reset. |

## 4. The threat model in one page

| Actor | Goal | Most plausible route today | Blocking control | Gap |
| --- | --- | --- | --- | --- |
| Anonymous internet user | Read or write an institution's graph | Brute-force an event code | 144-bit codes, per-IP limits | S-01 breaks the per-IP limit behind a proxy. |
| Authenticated member of institution A | Read institution B | Forge a `tid` | Signature check; tenant resolution through the router | None found. |
| Member of workspace W1 | Read workspace W2 of the same institution | Guess object identifiers | Membership check; 404 rule | None found. |
| Member (non-moderator) | Approve their own proposals as maintainer, or change vocabulary | Use the maintainer rule on their own content | Role checks on auto-apply and activation | Confirm the maintainer path with tests. |
| Compromised worker | Mint any identity in any tenant | Use `JWT_SECRET` from its environment | None beyond the secret's secrecy | **S-04.** |
| Compromised laptop on conference Wi-Fi | Reach demo databases | Connect to published ports | None | **S-05.** |
| Author of a survey response | Inject instructions into the model | Craft a prompt-like answer | Output validation | **S-11.** |
| Curious operator with database access | Map pseudonyms to people | Join `auth.users` to graph rows | None by design | Accepted (S-22). |
| Person who asks for erasure | Remove their traces | Not applicable: no erasure path | None | `05` §9, `15` D-15. |

## 5. Data protection and privacy checklist (for the data steward)

- Lawful basis and purpose for each listening source: to be documented per connector (`06` §6, decision D-16).
- Data inventory: identities (`auth.users`), pseudonymous contributions (graph and votes), listening records (Redis and
  the graph), AI outputs (embeddings, verdicts), and logs. Each has a retention rule today only for refresh tokens.
- Transfers: none today; local models. Bedrock or any hosted model is a transfer, and needs a data processing agreement
  and a region decision (`06` §9).
- Data subject requests: access, correction and erasure have no product path (`05` §9). Portability has none either.
- Breach response: no procedure, no contact list, no log retention policy. Write one before the pilot.
- Children, sensitive categories: confirm whether any listening source can contain health, disability or other
  sensitive data. The masker is not designed for special categories. [supuesto]

## 6. Order of work

**This week (XS effort, no design needed):** S-02 rotate and move the credential; S-05 bind the ports to loopback;
S-01 set `trustProxy` and add a test; S-13 add the `permissions` block; S-09 redact the callback parameters;
S-16 refuse seed and mint scripts in production.

**Before any demonstration to an audience:** S-05 (done above), a fresh `JWT_SECRET` and Redis password in the
demo environment, and no published Ollama port.

**Before the pilot:** S-03 (credential storage), S-06 (headers), S-08 (fail-closed for sensitive routes), S-10
(retention and edge masking), S-11 (injection controls), S-12 (supply chain), S-14 (audit trail), S-15 (agent
approval rule), and the identity decision in `08` (S-07).

**Before a second institution or any cloud deployment:** S-04 (asymmetric signing and worker tokens), the
erasure policy, a penetration test by someone other than the author, and a documented breach procedure.

## 7. What I did not check

- No dynamic testing against a running stack, and no fuzzing.
- No review of every route's authorisation logic line by line; the paths above were the highest-risk ones.
- No review of the PWA's service worker caching policy for sensitive responses. The shell is cached; data is not.
  A quick check is worth doing before the pilot.
- No review of the Python workers' dependency tree beyond the lockfile.
- No assessment of physical security or the developer's workstation.
