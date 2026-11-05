# ADR-0052: Dev environment bootstrap (base stack + Zitadel)

- Status: Accepted
- Date: 2026-11-04

## Context

Bringing VozLab up from a clean checkout required several manual steps
spread across `docs/ops/runbook-dev.md`, `docker/identity-lab/zitadel/README.md`
and `scripts/setup-zitadel.sh`: export `ZITADEL_MASTERKEY`, start the base
stack, start Zitadel, provision the OIDC client, paste the printed
`OIDC_*` block into `.env`, run migrations and seed, then start the API
and the web. Two friction points kept biting:

1. `ZITADEL_MASTERKEY` had to be exported per shell because Compose does not
   auto-load the root `.env` for a different compose file.
2. Switching between local dev (`localhost`) and a public demo (zrok
   shares) required destroying the Zitadel database, since Zitadel resolves
   the instance from the `Host` header and community v4.16 does not support
   multiple external domains on one instance.

## Decision

1. **One bootstrap script**: `scripts/dev-up.sh {demo}` brings up the base
   stack (Postgres + Redis + Ollama), Zitadel, runs migrations and seed,
   provisions the OIDC client, and prints the two commands to start the API
   and the web. The API/web are not started by the script (they need a tty
   for logs).
2. **Two independent Zitadel instances**, never running at the same time,
   each with its own compose project name (`vozlab-zitadel-local` vs
   `vozlab-zitadel-demo`) and its own DB volume. Switching modes stops one
   and starts the other (~5-10 s, no data loss, no re-provisioning after
   the first run).
3. **`env_file` in the Zitadel compose**: `env_file: ../../../.env` so
   `ZITADEL_MASTERKEY` is read from `.env` without `export`. The master
   key falls back to the documented dev default
   `MasterkeyNeedsToHave32Characters` when unset.
4. **Bind mount for the bootstrap PAT**: `./.zitadel-bootstrap` (per-mode
   subdir) instead of a named volume, so the PAT is readable on the host
   without `docker cp`.
5. **Per-mode env files**: `.env` (zrok/demo) and `.env.local` (localhost).
   `scripts/env.sh {demo|local}` sources the right one into the shell.
   `env.sh` never leaks `set -e`/`set -u` into the caller.
6. **`OIDC_SCOPES` is quoted** in all env files (spaces in the value).

## Consequences

- A clean checkout reaches a working login flow in ~5 commands.
- Switching between local and demo is a single `./scripts/dev-up.sh demo`
  (or back to `./scripts/dev-up.sh`), ~10 s, no data loss.
- The API/web must be restarted after a mode switch to pick up the new
  `OIDC_*` values (env vars are read at startup).
- Two small Zitadel DB volumes accumulate on disk; acceptable for dev.
- The orphan-containers warning from the old `vozlab-zitadel` project name
  is harmless; `docker compose ... down --remove-orphans` cleans it.
## Amendment (2026-11-04): host-side bootstrap state outlives Docker

`docker system prune --volumes` removes the Zitadel database but **not**
`.zitadel-bootstrap-<mode>/admin.pat`, which lives on the host. A naive
"PAT file exists → already provisioned" check therefore skipped provisioning
against an empty database, leaving `.env` with an OIDC client that did not
exist — login failed with no obvious cause.

The script now verifies against the **live** instance: it reads the PAT,
probes `POST /management/v1/projects/_search` with the correct `Host`
header, and requires a project named `vozlab`. Provisioning runs when the
probe fails, and is skipped (no secret rotation) when it succeeds.

Also amended:

- `scripts/env.sh` resolves its own path portably. `BASH_SOURCE` does not
  exist in zsh, so sourcing from zsh resolved the repository root one
  directory too high and looked for `/home/juan/repos/.env`.
- The Zitadel admin login embeds the external domain
  (`zitadel-admin@zitadel.<domain>`); `dev-up.sh` prints the exact one for
  the mode it started, and the runbook documents the console URL per mode.

## Amendment (2026-11-04): zrok shares are part of demo mode

A reserved zrok share is only a name until a `zrok share reserved` process
is bound to it. Without that process the edge answers **502 Bad Gateway**,
which reads like an application failure but is a missing tunnel. Demo mode
therefore starts the three shares itself:

- `scripts/zrok-shares.sh {start|stop|status}` owns them, with pidfiles and
  logs under `.zrok/` (gitignored).
- `dev-up.sh demo` calls `start`, so the public URLs work immediately after
  the bootstrap.
- Each share is started with `--override-endpoint http://127.0.0.1:<port>`:
  a reservation can carry a stale or IPv6-only endpoint, and a mismatch is
  invisible until it surfaces as 502.

Two Vite dev-server settings were required and are committed in
`apps/web/vite.config.ts`:

1. `server.host: '127.0.0.1'` — the default resolves `localhost` to `::1`
   on some hosts, while the shares proxy to IPv4 loopback.
2. `server.allowedHosts: ['.zrok.io']` — Vite rejects an unknown `Host`
   header with 403, which is what a forwarded public hostname looks like.

Both are development-only and loopback-scoped; neither exposes the dev
server on the LAN.

## Amendment (2026-11-04): two login traps found on a clean run

1. **MFA prompt on first login.** A fresh Zitadel instance requires the user
   to initialise a second factor, so the first real login stops on a
   "configure MFA / Skip" page that reads like a broken flow. The lab now
   sets `ZITADEL_DEFAULTINSTANCE_MULTIFACTORS_INITSKIP: "true"` and
   `ZITADEL_DEFAULTINSTANCE_DEFAULTLANGUAGE: "es"` (the UI defaulted to
   Arabic). Both are `FirstInstance` settings: they only apply when the
   instance is created, so an existing lab needs `dev-up.sh --reset`.
2. **Stale `OIDC_CLIENT_ID` after provisioning.** The API reads `OIDC_*` at
   process start and `tsx watch` does not reload `.env`. An API started
   before `dev-up.sh` (or before `--reset`, which mints a new client)
   answers the identity provider with a client id that no longer exists:
   `{"error":"invalid_request","error_description":"Errors.App.NotFound"}`.
   `dev-up.sh` now warns when it detects an API still listening on `:3000`,
   and the runbook documents the restart requirement.

## Amendment (2026-11-04): Zitadel tenant claim was never supported

`docker/identity-lab/zitadel/README.md` claimed the API already accepted
Zitadel's tenant claim. It did not: `OidcProviderClient.exchangeCode` read
only `tid` (Entra) and `hd` (Google), so a successful code exchange ended in
`ERR_OIDC_EXCHANGE_FAILED` ("ID token has neither a tid nor an hd claim").
The client now accepts `urn:zitadel:iam:user:resourceowner:id` as the third
and last source, with a unit test; it is the value `tenants.oidc_tenant_id`
already stores for a Zitadel institution.

The MFA initialisation prompt cannot be disabled in Zitadel v4 (the
`INITSKIP` setting is ignored and the v1 policy update answers "Default
Login Policy has not been changed"). The lab documents pressing **Skip**.
