# TASK-01 — Repository Hygiene & Governance Sync

> **Batch:** Phase 1R.1 (remediation) · **Depends on:** none · **Size:** S
> **Self-contained:** yes. You do not need to read any other file to execute this task, but
> read the files you are asked to edit before editing them.

## 1. Context
This monorepo is a `pnpm` + Turborepo workspace with `apps/*` and `packages/*`. A previous
audit found several hygiene defects that make the repo unsafe and the tooling inconsistent:

1. `.gitignore` ignores **only** `node_modules`, so `.env`, `dist/`, `.turbo/`, `.venv/` and
   logs are not ignored → risk of committing secrets and build artifacts.
2. Two **stale duplicate** command files exist at the repo root (`next-task.md`,
   `review-arch.md`). The real, maintained versions live in `.claude/commands/`.
3. `turbo.json` declares only a `build` task and still declares `.next/**` outputs (a stale
   Next.js leftover), even though this repo has no Next.js. There are no `lint` / `test` /
   `type-check` tasks, yet `docs/devops/devops_01_*` and `EXECUTION_PLAN.md` MILESTONE-4.5
   invoke `turbo run lint type-check` and `turbo run test:ci`.
4. `pnpm-workspace.yaml` contains `allowBuilds: esbuild: false`, which is not a valid pnpm
   key (pnpm uses `onlyBuiltDependencies` / `ignoredBuiltDependencies`).
5. The root `package.json` declares a `"workspaces"` field (npm-style) that is redundant
   with `pnpm-workspace.yaml`.

## 2. Objective
Make the repository safe to commit and give Turborepo the task pipeline the plan assumes,
without changing any application behaviour.

## 3. Project conventions (non-negotiable)
- Package manager: **pnpm only**. Never npm/yarn.
- **NodeNext**: every relative import in a `.ts` file ends with `.js` (`./server.js`).
- `pnpm turbo run build` = `tsc --noEmit` for every TS package. It must pass before you are
  done. It does **not** emit JS.
- Do not change application source in this task. Config/ignore files only.
- Keep the Turborepo managed block (`BEGIN:turborepo-agent-rules … END`) in `AGENTS.md`
  untouched — it is auto-managed.

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `.gitignore` |
| Delete | `next-task.md` (root duplicate) |
| Delete | `review-arch.md` (root duplicate) |
| Edit | `turbo.json` |
| Edit | `pnpm-workspace.yaml` |
| Edit | `package.json` (root) |

## 5. Step-by-step instructions
1. Replace the contents of `.gitignore` with an ordered list that ignores at least:
   `node_modules/`, `.turbo/`, `dist/`, `build/`, `coverage/`, `.env`, `.env.*`
   (but keep `!.env.example`), `.venv/`, `__pycache__/`, `*.py[cod]`, `*.log`,
   `playwright-report/`, `test-results/`, `.DS_Store`, `.idea/`, `.vscode/`.
2. Delete the root `next-task.md` and `review-arch.md` (keep `.claude/commands/*`).
3. Rewrite `turbo.json` so it:
   - keeps `build` (with `dependsOn: ["^build"]`, `cache: true`) but uses `"outputs": []`
     because `tsc --noEmit` produces no files (remove the `.next/**` block entirely);
   - adds `lint`, `type-check`, `test`, `test:ci` tasks, each with `dependsOn: ["^build"]`
     and `cache: true`. Use `"outputs": []` for `lint`/`type-check`/`test:ci` and
     `["coverage/**"]` for `test`.
   - Do NOT set `"agentGuidance": false`.
4. In `pnpm-workspace.yaml`, remove the invalid `allowBuilds` key. If build-script gating is
   desired, use `onlyBuiltDependencies:` with a list; otherwise leave only `packages:`.
5. In the root `package.json`, remove the `"workspaces"` field (pnpm uses
   `pnpm-workspace.yaml`). Add a `"type-check": "turbo run build"` script for parity with CI.
6. Do not touch any `packages/*/package.json` scripts.

## 6. Constraints & gotchas
- `git rm`/delete only the two root markdown files listed. Do not delete `.claude/**`.
- If `turbo.json` validation complains about a task, resolve it by reading the installed
  Turborepo docs (resolve the package with
  `node -p "require.resolve('turbo/package.json')"` and read its bundled `docs/README.md`)
  rather than guessing — AGENTS.md explicitly warns the installed Turbo may differ from
  your training data.

## 7. Acceptance criteria
- [ ] `.gitignore` ignores `.env`, `.turbo/`, `dist/`, `.venv/`.
- [ ] Root `next-task.md` and `review-arch.md` no longer exist.
- [ ] `turbo.json` has no `.next/**` reference and declares `build`, `lint`, `type-check`, `test`.
- [ ] `pnpm-workspace.yaml` has no `allowBuilds` key.
- [ ] `pnpm turbo run build` still passes (3/3 packages).

## 8. Verification commands
```bash
pnpm turbo run build
git check-ignore -v .env dist .turbo        # must print matches
pnpm turbo run lint --dry=json              # resolves without config errors (may report no lint script for some pkgs)
```

## 9. Definition of done / handoff
- Run `pnpm turbo run build`; it must pass.
- Mark `TASK-01` as `[x]` in `TODO.md` with a one-line result note.
- Commit only the files listed above.
- If a Turborepo key behaves unexpectedly on the installed version, STOP and ask with
  options + pros/cons instead of guessing.

## 10. Out of scope
- Adding CI workflows (Phase 4), changing application source, or adding per-package `test:ci`
  scripts beyond what already exists.
