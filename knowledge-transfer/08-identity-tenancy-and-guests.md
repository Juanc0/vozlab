# 08 — Identity, tenancy and guest access

This file answers your question on casual and unregistered users: could a guest join a specific workspace with a
code or an invitation, and could one person be authenticated across several tenants or workspaces at once? It
analyses the options against the current model, which is precise and well documented. It also records one structural
finding that matters more than the guest question: **the API trusts exactly one identity issuer** (F-17).

## 1. The judgment

- **Guest access by code already exists** in a limited form: an anonymous event member bound to one workspace, with
  expiry, capacity and revocation. A generalised invitation is a small, safe extension.
- **One person across several institutions is not supported, and should not be built now.** It requires a global
  identity table that links a person's activity across institutions, which conflicts with the tenancy design
  (ADR-0002) and with the privacy purpose of pseudonymity (ADR-0013). If a real need is documented later, it deserves
  an explicit ADR and consent design.
- **One person across several workspaces of the same institution already works.** One account, several memberships,
  one pseudonym. This covers most of what people mean by "multiple workspaces".
- **The more urgent identity problem is F-17**: a single issuer. It blocks the multi-institution vision, whatever
  guest model is chosen.
- **The second urgent identity problem is F-02**: nothing can add a person to a workspace.

## 2. What exists today, verified

| Question | Current answer | Evidence |
| --- | --- | --- |
| Who is a user? | An account in one tenant database, keyed by `(provider, provider_user_id)`. Each account has a random pseudonym (`author_hash`). | [repo] `auth-and-tenancy.md` §6, §10 |
| How does a login pick a tenant? | The ID token's `tid` (Entra) or `hd` (Google Workspace), matched against `tenants.oidc_tenant_id`. `iss` is not used. | [repo] `OidcProviderClient.ts` line 124 (`claims.tid ?? claims.hd`) |
| How many issuers can the API trust? | **One.** The issuer and JWKS URL are single environment values, and the signature check requires that issuer exactly. | [repo] `env.ts`; `OidcProviderClient.ts` (`jwtVerify(... { issuer: this.config.issuer })`) |
| What does a session carry? | One tenant (`tid`) in the access token; the refresh token carries the tenant UUID. | [repo] `auth-and-tenancy.md` §1, §11 |
| Can one session span tenants? | No. Switching institution means a new sign-in. | Follows from the above. |
| Can one session switch workspace? | Yes, within the tenant: the `X-Workspace-ID` header changes per tab, with a membership check on every request. | [repo] FR-04, FR-05 |
| How does a person gain membership? | Only by event code (anonymous, one workspace) or by a database edit. No route creates or removes memberships. | [repo] routes; F-02 |
| What happens to a person with an account in two institutions? | Two accounts, two pseudonyms, no link. This is intended. | [repo] ADR-0013; `auth-and-tenancy.md` §10 |
| Can an anonymous event member become an institutional user? | No. A matching verified email on an anonymous account is a conflict (409). The anonymous account keeps its content and cannot be merged. | [repo] `auth-and-tenancy.md` §6 |
| Can a personal account (no `hd`, no `tid`) sign in? | No. The ID token must carry a tenant key. | [repo] `OidcProviderClient.ts` line 128 |

## 3. Five cases, walked through

| Case | Outcome today | Is it right? |
| --- | --- | --- |
| **A.** A member of institution A works in two workspaces of A | One account, two memberships, one pseudonym. Votes and maintainer rights follow the pseudonym across both workspaces. | Yes. This is the intended model. |
| **B.** The same person is also a member of institution B | Two accounts in two tenant databases, two pseudonyms, no shared identity. They must sign in separately to each. | Yes for privacy and sovereignty. Poor for a person who works with both. |
| **C.** A visiting researcher from another institution is invited to one workspace | Possible only if the researcher signs in through **your** IdP as a guest (Entra B2B creates a guest object in your directory, and the token's `tid` is yours). Then an administrator must add the membership, which the product cannot do (F-02). | Correct model; missing admin tooling. |
| **D.** An attendee at an event joins with a code | An anonymous account bound to that workspace, with a random pseudonym and an alias. It can contribute after the event. It can never become an institutional account. | Acceptable for low-stakes participation. Needs an upgrade path or an explicit "this account stays anonymous" policy. |
| **E.** A member of the public, with a personal Google or Microsoft account, is invited | Rejected at sign-in: no tenant key. | Correct for an institutional product; it means "public guest" needs a different tenant type. |

## 4. The structural finding: one issuer (F-17)

The API validates an ID token against **one** issuer and **one** JWKS endpoint, both from the environment. The
consequences differ by provider:

| Provider | How issuers work | Effect under the current configuration |
| --- | --- | --- |
| **Google Workspace** | One issuer (`accounts.google.com`) for every domain; the `hd` claim names the domain. | Works for any number of Google-hosted institutions, because they share an issuer and the tenant is resolved by `hd`. |
| **Microsoft Entra ID (multi-tenant app)** | The issuer is **tenant-specific**: `login.microsoftonline.com/{tid}/v2.0`. | Works for **exactly one** Entra tenant. Every other institution's tokens fail the issuer check. |
| **Mixed (one Entra institution, one Google institution)** | Two issuers. | Impossible with a single configuration. |

The code already resolves the tenant from `tid`, so the fix is contained in the identity adapter. The
standard approach for a multi-tenant Entra application is to accept an issuer that matches the pattern
`https://login.microsoftonline.com/<tid>/v2.0`, to require that the `<tid>` in the issuer equals the `tid` claim,
and to require that the tenant exists in the router. Mixed providers require a **per-tenant identity configuration**
in the router (issuer, JWKS, client identifiers), which would be a schema change and a new ADR.

**Recommendation (judgment):** decide the identity provider for the first pilot institution first. If it is
Entra, implement the pattern check and test it with a fixture for two tenants. If mixed providers are a near-term
requirement, add per-tenant identity configuration to the router and supersede the single-issuer decision in
ADR-0018. Do this before any second institution is onboarded; retrofitting it later is a risky change to the
sign-in path.

## 5. Guest access: options compared

Guest access means a person who is not a member of the institution's directory can take part in a workspace. The
options below differ in who verifies the person, where the account lives, and how it ends.

| Option | Who verifies the person | Account location | Effort | Privacy footprint | Fit with ADRs | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Event codes (exists)** | Nobody beyond possession of the code | Tenant database, anonymous | Built | Minimal: no email | ADR-0019 | **Keep** for in-person events. |
| **B. Invitation codes, generalised** | Possession of the code; optional email binding | Tenant database | S (1–2 weeks) | Minimal, or an email if bound | Extends ADR-0019 | **Recommended next step** for remote guests who do not have an institutional account. |
| **C. Email magic-link or one-time-code invitations** | The email owner | Tenant database, with an email address | M (3–4 weeks, incl. email delivery) | Stores an email: needs retention and erasure rules | New ADR; sends mail | Consider later; needs a mail provider and a deliverability plan. |
| **D. Institutional IdP guests (Entra B2B, or a guest flow on the institution's IdP)** | The institution's IdP | Tenant database (JIT), linked to the IdP subject | S, plus admin tooling for membership (F-02) | Email held by the IdP; the API stores the subject | Fits ADR-0018 exactly; the tenant is the resource tenant | **Recommended** for guests who are members of other institutions, once F-02 exists. |
| **E. Global person identity across tenants** | A global identity service | Router (global person), plus per-tenant accounts | L (2–3 months) | High: links activity across institutions | Supersedes ADR-0002 (partly), ADR-0013 (linkage), ADR-0019 (scope) | **Do not build now.** Requires an ADR, consent design, and a privacy review. |
| **F. Open public accounts (any person, any provider)** | The provider (consumer identities) | A new tenant type with lower trust | L | High: public accounts, abuse, moderation load | New tenant model; rate and abuse controls | Out of scope for an institutional product; revisit with a clear product case. |

### 5.1 Recommendation

Combine **A, B and D**, and keep **E** and **F** out of the roadmap until a documented requirement exists:

1. Keep anonymous event codes for in-person events (A).
2. Generalise them into **invitation codes** for a workspace: expiry, maximum uses, optional email binding, a role
   (`MEMBER` by default, `MODERATOR` only if an administrator chooses), and revocation (B). This reuses the existing
   atomic consumption, so the cost is mostly the admin surface.
3. For guests who belong to another institution, use that institution's IdP through the resource tenant (D), and add
   the membership through the membership administration that F-02 requires.
4. Document what an anonymous account can never do: it cannot be upgraded or merged into an institutional account.
   Offer an explicit alternative (an invitation with an institutional sign-in) if a person needs to move.

### 5.2 Why not a global identity (E), in plain terms

A global identity makes it easy for one person to move between institutions, and it makes the platform's most
sensitive property, the separation between institutions, depend on the correctness of a link table. It also
creates a dataset that says "this pseudonym in institution A is the same person as that pseudonym in institution B".
That is a privacy change of the first order, and the community must consent to it. The tenancy design was built to
prevent exactly that. The honest answer to "can a user be authenticated across tenants" is therefore **no, by
design**, and the product should say so in its help text.

If the need appears, the design is well understood: a router-level person record, consent flags per tenant,
pseudonyms that are not shared, and a token that names the tenant it is valid for. It is an ADR and a privacy
assessment, not a sprint.

## 6. The identity provider for each deployment

| Option | Good for | Watch for |
| --- | --- | --- |
| **Microsoft Entra ID** | Institutions on Microsoft 365; B2B guest model is mature [web] | Tenant-specific issuers (F-17). Guest objects are created per resource tenant [web]. |
| **Google Workspace** | Institutions on Google; one issuer; `hd` makes tenant resolution simple | Personal accounts have no `hd` and are rejected (intended). |
| **Zitadel (self-hosted)** | Production broker (OIDC + SAML 2.0). Go-based, ~128 MB RAM. Runs under `docker compose --profile idp` on `:8081`. Setup via `scripts/setup-zitadel.sh`. | Replaces Keycloak for production (ADR-0030). Keycloak is retained in `docker/identity-lab/` for SAML/LDAP testing only. |
| **Amazon Cognito** | Managed user pools with federation to Entra and Google; regional | Cost and pricing model (verify); a second user model to reconcile with the API's accounts. |
| **Okta, Auth0 (commercial)** | Enterprises with existing contracts | Cost; lock-in; not required here. |

**Judgment for the demo:** add a Keycloak service with a pre-built realm to Compose. Then the presentation can show
the real sign-in flow (authorisation code with PKCE, refresh rotation, logout) offline, instead of the development
token shortcut, which is labelled as dev-only for good reason. This is the single change that makes the local demo
more honest, at a modest cost. It is covered in `12`.

## 7. Session and revocation details that matter in practice

| Behaviour | Implication |
| --- | --- |
| Access token: 15 minutes. Refresh: 30 days, rotated on every use, reuse revokes the family. | Good. A stolen refresh token is detected on its second use. |
| Logout blacklists the access token's `jti` for its remaining life. Redis outage: blacklist fails open. | Logout is not immediate during a Redis outage. Accept, and monitor (`09`). |
| Rotating `JWT_SECRET` invalidates all access tokens but not refresh tokens. | Useful for an emergency access-token reset. There is no "sign out everywhere" route, and none is needed on day one. |
| Each refresh family is independent; there is no list of a user's sessions. | Users cannot see or end their other sessions. Add a sessions view before the pilot if institutions ask for it. |
| The refresh cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/api/v1/auth`, `Secure` in production. | Correct for the threat model. Verify `Secure` once the API is behind HTTPS. |
| Event-join consumes the code before the tenant transaction; a tenant failure burns one use. | Documented trade-off (ADR-0019). Acceptable at small scale. |
| Per-IP rate limits on public auth routes; behind a load balancer, without `trustProxy`, all clients share one bucket. | F-05. Fix before deployment. |

## 8. Gaps to close, in order

1. **Membership administration (F-02).** Administrators list, add, change the role of, and remove members of their
   workspaces; each action is authorised by the caller's role and recorded. Minimal scope: a route set, the same
   operations in the CLI, and tests for the cross-workspace 404 rule.
2. **Trust of one issuer (F-17).** Pattern validation for multi-tenant Entra, or per-tenant identity configuration,
   decided per section 4.
3. **`trustProxy` (F-05).** Set to the exact number of trusted proxy hops or to the load balancer's address range.
4. **Invitation codes (B)** with a role and optional email binding.
5. **Local Keycloak in Compose (section 6).**
6. **Sessions view and sign-out everywhere**, if institutions ask.
7. **Erasure and retention policy** for accounts (`05` §9).
8. **An audit trail for role changes and membership changes.** The tables for it do not exist; it is needed for any
   institution's governance review.

## 9. Questions I need answered to finish this design

1. Which identity provider will the first institution use? (Entra, Google Workspace, or something else.)
2. Will any institution need to invite people from another institution regularly? Or are guests mostly event
   participants?
3. Is a person's presence in two institutions something the community should be able to see? (The answer decides
   whether option E is ever acceptable.)
4. Should anonymous event participants be able to vote on proposals that change the vocabulary, or only on content?
