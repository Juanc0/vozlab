# ADR-0040: Demo exposure uses three independent zrok shares (no reverse proxy)

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0033 (demo topology single host), ADR-0030 (Zitadel replaces Keycloak)

## Context

The original demo launcher (`scripts/demo.sh`) put the API (`:3000`) and the PWA
(`:5173`) behind a single reverse proxy (`scripts/demo-proxy.mjs` on `:8080`)
so that one Cloudflare Quick Tunnel could expose the whole demo under a single
public URL. Zitadel already had its own share (auth). That worked, but:

- The proxy was an extra moving part that had to be kept in sync with the two
  backends and was a single point of failure for the demo.
- The relative `PUBLIC_API_BASE_URL=/api/v1` trick only worked because of the
  proxy; it masked the real cross-origin nature of the deployment.
- Cloudflare Quick Tunnels are ephemeral and rotate URLs on every restart,
  which breaks the OIDC redirect URIs registered in Zitadel.

zrok offers **reserved public shares** with stable hostnames, one per backend.
With three reserved shares (web, API, auth) we can drop the proxy entirely and
let the PWA talk to the API share directly, relying on the API's CORS policy.

## Decision

1. **The demo is exposed through three reserved zrok shares**, one per service:
   - `vozlabdemo` → `http://localhost:5173` (PWA)
   - `vozlabapi`  → `http://localhost:3000` (API)
   - `vozlabauth` → `http://localhost:8081` (Zitadel)
2. **The reverse proxy (`scripts/demo-proxy.mjs`) and the Cloudflare mode are
   removed.** `scripts/demo.sh` now only supports zrok.
3. **The PWA uses an absolute API base URL** (`PUBLIC_API_BASE_URL` =
   `https://vozlabapi.share.zrok.io/api/v1`) instead of the relative `/api/v1`.
   CORS with credentials is already enabled in the API (`origin: true`,
   `credentials: true`), so cross-origin cookies work.
4. **Zitadel is provisioned with the public auth issuer** via
   `ZITADEL_PUBLIC_URL=https://vozlabauth.share.zrok.io` and the API callback
   is registered against the API share
   (`https://vozlabapi.share.zrok.io/api/v1/auth/callback`).
5. **Share tokens are stored in `.env`** (`ZROK_WEB_SHARE_TOKEN`,
   `ZROK_API_SHARE_TOKEN`, `ZROK_AUTH_SHARE_TOKEN`) and consumed by `demo.sh`.

## Consequences

### Positive

- No reverse proxy to maintain; each service is independently restartable.
- Stable public URLs across restarts (reserved shares), so OIDC redirect URIs
  stay valid.
- The deployment reflects the real production topology (separate origins).

### Negative / costs

- Requires a zrok account and three reserved shares (one-time setup).
- The host must reach `api-v2.zrok.io`; without connectivity no share starts.
- Three share processes instead of one tunnel.

## Links

- `scripts/demo.sh`
- `docs/ops/runbook-demo-zrok.md`
- `.env.example`
- `docs/decisions/ADR-0033-demo-topology-single-host.md`