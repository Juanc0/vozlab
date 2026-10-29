# Auth & Onboarding v5 — Task Index

Scope: evolution of authentication/onboarding to support explicit tenant selection,
cross-tenant access, external collaborators, ephemeral workspace codes, multiple
roles per workspace, and atomized flows. Source of truth: `docs/analysis/auth-onboarding-committee-review.md`.

Each task is self-contained and can be executed independently by a single agent.
Tasks are ordered by dependency but written to be standalone. Run `pnpm turbo run build type-check test` after each.

| Task | Title | Size |
|------|-------|------|
| 01 | Router DB identity table (global_users) + tenant linking | L |
| 02 | Explicit tenant selection + tenant selector | L |
| 03 | Ephemeral/revocable workspace join codes | M |
| 04 | Workspaces.kind + users.is_anonymous + GUEST role | M |
| 05 | Multiple roles per workspace (schema + union verification) | M |
| 06 | Global invitations (cross-IdP) | L |
| 07 | Alta directa by handle/identity (not email) | M |
| 08 | Atomize auth/onboarding flows + audit | L |
| 09 | Social logins in Zitadel + knowledge transfer | S |