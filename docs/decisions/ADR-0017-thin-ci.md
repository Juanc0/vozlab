# ADR-0017: Thin CI now; full Phase 4 pipeline planned

- Status: Accepted
- Date: 2026-10-19

## Context

The DevOps specification describes a full pipeline with linting, unit and integration tests, coverage, end-to-end tests and k6 load tests, plus a PostgreSQL service. The repository has a Vitest baseline (domain, use cases and infrastructure helpers with fakes) and no integration/E2E/load suite. `pnpm lint` is currently red because of pre-existing `no-explicit-any` debt, so adding it to CI would make the pipeline permanently fail before the debt is paid.

## Decision

CI stays deliberately thin and green:

- Trigger on pull requests and pushes to `main`.
- Steps: checkout, `pnpm/action-setup` (version from `packageManager`), Node 22 with pnpm cache, `pnpm install --frozen-lockfile`, then `pnpm turbo run build type-check test`.
- No lint step, no database/Redis services, no integration/E2E/load/coverage jobs.
- `lint` is excluded until the existing violations are fixed; it must not be "fixed" by making the workflow non-blocking or by ignoring the debt.

The full Phase 4 pipeline remains planned: integration tests with an ephemeral database, Playwright E2E, k6 load tests, coverage thresholds and a lint gate once the tree is clean.

## Consequences

### Positive

- Every pull request gets a fast, reliable type-check and unit-test signal.
- The pipeline has no external service dependency, so it is not flaky for infrastructure reasons.
- The scope is explicit; missing coverage is a known gap, not a silent omission.

### Negative / costs

- Style and lint regressions are not gated; the `no-explicit-any` debt can grow.
- Integration bugs (Drizzle, Redis, transactions) and browser flows are not caught before merge.
- Coverage and performance regressions are invisible until Phase 4 lands.
- The lint gate will fail on the first run unless the existing violations are cleared first.

## Links

- `.github/workflows/ci.yml`
- `docs/components/ci-cd.md`
- `package.json` (root scripts)
- `turbo.json` (`build`, `type-check`, `test`)
- `docs/archive/spec-v1/devops/devops_01_deployment_ci_cd_docker.md` §2
- `docs/archive/spec-v1/devops/devops_03_qa_and_testing_plan.md`
- `docs/archive/history/EXECUTION_PLAN-2026-10-19.md` -> Phase 4
- `docs/archive/tasks/TASK-45_test-task-wiring.md`
