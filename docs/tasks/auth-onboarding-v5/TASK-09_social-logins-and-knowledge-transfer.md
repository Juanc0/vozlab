# TASK-09 — Social logins in Zitadel + knowledge transfer propagation

> **Batch:** Auth v5.9 · **Depends on:** none · **Size:** S
> **Self-contained:** yes.

## 1. Context
External collaborators (gmail, social) cannot authenticate. Need to enable social IdPs in Zitadel and document the auth/onboarding model.

## 2. Objective
Enable Google (personal) and Microsoft (personal) social logins in Zitadel realm. Propagate the auth/onboarding v5 decisions to ADRs, docs, and knowledge-transfer.

## 3. Propagation targets
- `docs/decisions/ADR-0042-cross-tenant-identity-and-explicit-tenant.md` (new)
- `docs/requirements.md` (update US-00, add cross-tenant stories)
- `knowledge-transfer/guia-identidad-ia/` (update or add files for v5 model)
- `docs/analysis/auth-onboarding-committee-review.md` (already exists; keep as reference)

## 4. Additional: document decision matrix
- Add a decision matrix to requirements.md or a dedicated doc: when to use each flow (OIDC, event join, invitation, join request, direct add) based on user type and workspace kind.
- Include the matrix in knowledge-transfer.

## 5. Acceptance criteria
- Social login works in identity lab.
- ADR created.
- requirements.md updated with decision matrix.
- Knowledge transfer updated.