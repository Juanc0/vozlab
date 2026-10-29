# TASK-12 — Seed + devops (contenedores, HTTPS, HSTS, CSP)

> Batch: v6.12 · Depends on: none · Size: M · Self-contained: yes.

## 1. Context
Seed only creates tenant admin + static join code. API/web run as host processes. No HTTPS/HSTS/CSP in dev/prod.

## 2. Objective
Extend seed: workspaces kind=EVENT with ephemeral codes, sample invitations. Containerize API and web (Dockerfiles). Add HTTPS (Caddy/traefik or ACM), HSTS, CSP headers. Update docker-compose profiles.

## 3. Files to touch
- packages/database/scripts/seed-dev.ts
- apps/api/Dockerfile, apps/web/Dockerfile
- docker-compose.yml (add api/web services, optional)
- Fastify security headers (helmet/CSP)
- docs/ops deployment notes

## 4. Acceptance criteria
- `db:seed:dev` creates EVENT workspace + codes + invitations.
- API/web run in containers.
- Security headers present.
- build/type-check/test green.