# ADR-0043: Production topology is T2 — Caddy on a single host, three origins

- Status: Accepted
- Date: 2026-10-29
- Related: ADR-0040 (zrok three shares, no reverse proxy), ADR-0033 (demo
  topology single host), ADR-0030 (Zitadel replaces Keycloak),
  `docs/analysis/production-topology-b11.md` (full trade-off analysis),
  B11 in `docs/analysis/auth-onboarding-committee-review.md`

## Context

B11 (v6/TASK-12, subtask 12.3) requires real TLS, HSTS/CSP and verified
api/web containers for a production deployment — the demo gets its TLS from
the zrok edge (ADR-0040) and nothing else. Three candidate topologies were
analyzed in `docs/analysis/production-topology-b11.md`:

- **T1** — a managed load balancer per service (AWS ALB / Cloudflare).
- **T2** — one Caddy reverse proxy on one host, three hostnames
  (`app.` / `api.` / `auth.`).
- **T3** — a single origin: the proxy also routes `/api/*` to the API so the
  browser only ever talks to `app.example.com`.

The project has a specific constraint: the OIDC/callback surface is exactly
seven registered URLs across four systems (Zitadel app redirects, the Google
and Microsoft OAuth clients, the API env, the web env) and it already caused
significant integration pain when the zrok hostnames were introduced. Every
topology must be judged by how much of that surface it moves.

## Decision

**Adopt T2: Caddy terminates TLS on the deployment host and exposes three
origins — `app.`, `api.` and `auth.` — mirroring the zrok demo shape 1:1.**
T3 is rejected and its latent support is removed.

1. Caddy owns TLS (automatic Let's Encrypt), HTTP→HTTPS redirect, HSTS and
   the CSP baseline declared in `deploy/caddy/Caddyfile`. The backends keep
   serving plain HTTP on localhost.
2. The API trusts `X-Forwarded-*` only from loopback and RFC1918/ULA peers,
   as literal CIDRs (`apps/api/src/infrastructure/http/proxyTrust.ts`;
   proxy-addr does not accept Express's named ranges). Private is in the set
   because Docker NAT presents the bridge gateway, not 127.0.0.1, as the
   socket peer inside the container. This keeps the anonymous rate-limit
   buckets keyed by the real client IP. Production backends publish on
   127.0.0.1 only, so no public peer can ever reach them and a private-source
   spoof is not routable from the internet.
3. `PUBLIC_API_BASE_URL` stays an **absolute** origin. The relative-base
   branch of `normalizeApiBaseUrl()` (a leftover of the removed
   `demo-proxy.mjs`, the only code path that existed to support T3) is
   deleted; T2/T1 never configure one.
4. Zitadel keeps its own hostname and runs with `ZITADEL_EXTERNALDOMAIN=auth.…`,
   `EXTERNALPORT=443`, `EXTERNALSECURE=true`; the seven-URL checklist in
   `deploy/README.md` is the canonical migration procedure (it is also the
   T2→T1 migration, since the origin model is identical).
5. Moving from T2 to T1 (managed LBs) later is **not** an architecture
   change: same three origins, same URLs, same cookies. It stays available.

## Consequences

### Positive

- Production has the same origin shape as the demo and as E2E: no
  environment-specific routing bugs; the callback matrix validated with zrok
  transfers verbatim.
- TLS, HSTS and CSP live in one readable file at the TLS terminator; no
  application change is needed to tune them.
- The cookie policy keeps working untouched: `app.` and `api.` share the
  registrable domain, so `SameSite=Lax` remains correct (no `None` upgrade).
- ~5-20 USD/month VPS; Caddy automates certificates end to end.

### Negative / costs

- The host is a single point of failure (mitigated by image-based
  reprovisioning + DB backups; T1 remains the escape hatch).
- Certificate issuance requires correct DNS before first boot.
- The CSP baseline in `deploy/caddy/Caddyfile` still needs tuning against a
  real staging build (TASK-12.3) before go-live.

## Links

- `docs/analysis/production-topology-b11.md`
- `deploy/caddy/Caddyfile`, `deploy/README.md`
- `docs/ops/production-deployment.md`
- `apps/api/src/infrastructure/http/proxyTrust.ts`
