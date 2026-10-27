# ADR-0039: Deploy strategy for the MVP — single host, published images, Cloudflare Tunnel

- Status: Accepted
- Date: 2026-10-27
- Related: ADR-0033 (demo topology), ADR-0034 (Redis Streams), ADR-0037 (Ollama)

## Context

The MVP needs a reproducible way to run the full stack on a single host with
public TLS access, without cloud cost. The repo has no remote; images are built
locally and run via `docker-compose.prod.yml`.

## Decision

1. **Images are built locally** (`docker build -f apps/*/Dockerfile`) and tagged
   `vozlab/*:latest`. No registry push is required for the demo.
2. **`docker-compose.prod.yml`** runs published images with health checks,
   restart policies and a one-shot `migrate` container.
3. **Migrations run as a one-shot container** before the API starts.
4. **Public access via Cloudflare Tunnel** (free, TLS included, no inbound ports).
   See `docs/runbook-deploy.md`.
5. **Floci + Terraform** provide a local AWS emulation for IaC testing
   (`docker/floci/`, `infra/terraform/`). They are optional and do not affect
   the demo.
6. **GitHub Actions deploy workflow** is provided but disabled-by-default
   (commented SSH step) until a remote and a target host are configured.

## Consequences

### Positive

- Zero cloud cost; runs on the demo machine.
- Reproducible: build → migrate → up.
- IaC skeleton ready for Phase 5 cloud migration.

### Negative / costs

- Single host, no HA, no autoscaling.
- Image distribution is manual (no registry push for the demo).
- Cloudflare Tunnel requires a domain on Cloudflare.

## Links

- `docker-compose.prod.yml`
- `.env.production.example`
- `docs/runbook-deploy.md`
- `docker/floci/docker-compose.yml`
- `infra/terraform/`
- `.github/workflows/deploy.yml`
