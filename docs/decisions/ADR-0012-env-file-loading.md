# ADR-0012: `.env` loading via `tsx --env-file-if-exists`

- Status: Accepted
- Date: 2026-10-19

## Context

The documented dev workflow said to copy `.env.example` to `.env`, but nothing loaded the file: `tsx` has no dotenv support, `dotenv` was not a dependency, and neither `dev` nor `start` passed `--env-file`. The Zod environment validation therefore exited 1 unless every variable was exported manually. The database helper scripts had the same problem, including `db:mint-token`, which reads `JWT_SECRET`.

## Decision

Local processes load the repository-root `.env` through Node's own loader:

- API: `tsx watch --env-file-if-exists=../../.env src/index.ts` for `dev` and `tsx --env-file-if-exists=../../.env src/index.ts` for `start`.
- Database: `NODE_OPTIONS='--import tsx' tsx --env-file-if-exists=../../.env scripts/<script>.ts` for `db:seed:dev` and `db:mint-token`.
- No `dotenv` dependency. `--env-file-if-exists` is tolerant: without the file the process still starts and the Zod validation reports the missing variables instead of an `ENOENT`.
- Variables already present in the process environment are never overridden by the file.
- Production does not read `.env`; environment variables come from the orchestrator/secret manager. The same scripts work because the flag finds no file.
- `.env.example` is the only committed sample; `.env` is git-ignored.

## Consequences

### Positive

- Copying `.env.example` to the repository root is sufficient to boot the API and run the DB scripts.
- There is no extra dependency and no custom loader to maintain.
- The same command shape works locally and in production, where the file is absent.

### Negative / costs

- The relative path is tied to the package working directory; running a script from another directory will not find the file.
- There is no variable interpolation or multi-file layering beyond what Node's loader provides.
- A missing `.env` is not an error, so a developer can reach the Zod failure instead of an immediate "file not found" hint.

## Links

- `apps/api/package.json` (`dev`, `start`)
- `packages/database/package.json` (`db:seed:dev`, `db:mint-token`)
- `.env.example` header
- `docs/archive/spec-v1/devops/devops_01_deployment_ci_cd_docker.md` §1.1
- `.claude/reviews/REVIEW-2026-10-17_phase-1s.md` H-6
- `.claude/tasks/TASK-32_dev-env-loading.md`
