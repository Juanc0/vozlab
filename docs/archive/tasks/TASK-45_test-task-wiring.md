# TASK-45 — Wire the `test` Task (root script + Turbo outputs warning)

> **Batch:** Phase 1T.5 (Quality) · **Depends on:** TASK-44 · **Size:** XS
> **Self-contained:** yes. Read the files you are asked to edit before editing them.

## 1. Context
`turbo.json` already declares `test` (`dependsOn: ["^build"]`, `outputs: ["coverage/**"]`), and
`pnpm turbo run test` runs the API's Vitest suite — but:

- It warns: `no output files found for task @vozlab/api#test. Please check your `outputs` key in
  `turbo.json`` because no coverage is produced.
- The **root** `package.json` has no `test` script, so `pnpm test` fails even though the task
  exists.

## 2. Objective
Make `pnpm test` work from the root and silence the misleading outputs warning, so CI
(`MILESTONE-4.5`, Phase 4) can depend on a stable `test` task.

## 3. Project conventions (non-negotiable)
- **pnpm only.**
- `pnpm turbo run build` must pass.
- Do not add CI workflows in this task (Phase 4 owns them).

## 4. Files to touch
| Action | Path |
| --- | --- |
| Edit | `package.json` (root — add `test`) |
| Edit | `turbo.json` (`test` outputs) |

## 5. Step-by-step instructions
1. Add to the root `package.json` scripts: `"test": "turbo run test"` (mirror the existing
   `build`/`lint` style). Keep `type-check` as-is.
2. In `turbo.json`, set `test.outputs` to `[]` (no coverage today) **or** add an `apps/api`
   coverage script and keep `["coverage/**"]`. Choose `[]` now; note in the `TODO.md` result note
   that coverage outputs are re-enabled when `MILESTONE-4.1` adds thresholds.
3. Run `pnpm test` from the root; confirm no `no output files` warning and all tests pass.

## 6. Constraints & gotchas
- Do **not** add a coverage provider or thresholds here.
- Do **not** change what `build`/`type-check`/`lint` do.
- Keep the Turbo managed block in `AGENTS.md` untouched.

## 7. Acceptance criteria
- [ ] `pnpm test` from the repo root runs the suite and exits 0.
- [ ] `pnpm turbo run test` prints no `no output files` warning.
- [ ] `pnpm turbo run build` passes (3/3).

## 8. Verification commands
```bash
pnpm test
pnpm turbo run build
```

## 9. Definition of done / handoff
- Run both commands; mark `TASK-45` `[x]` in `TODO.md` with a one-line result note stating that CI
  can now call `pnpm test`.

## 10. Out of scope
- GitHub Actions workflows (Phase 4).
- Coverage thresholds.
