# Frontend plan examples — opening a small scoped frontend plan

> **Knowledge doc — worked walkthroughs, not a plan.** Opened 2026-10-31 from
> `docs/plans/frontend-tooling/v1.md` T6. Each example below is a *complete,
> copy-pasteable* plan file that follows `docs/plans/README.md` (template) and
> the task-line convention used across this repo. Replace the placeholders
> (`YYYY-MM-DD`, area, goal) and the version number, then run the open-plan
> commit command at the end of the example. Graduates when a real
> `plans/<area>/v<N>.md` is opened from one of them; the doc then moves to
> `docs/archive/`.
>
> Companion: `AGENTS.md` §"Frontend work" (skills, MCPs, capture script,
> evidence rule), `docs/components/web-pwa.md` §Tooling baseline,
> `docs/knowledge/frontend-design-tokens.md`.

## How to read an example

Every example is a full plan file. It shows, in order:

1. **Area name** — the directory under `docs/plans/` (`<area>/v<N>.md`).
2. **Goal** — one paragraph, with an observable "done means".
3. **Slice** — horizontal (layer by layer) for tooling/token work, vertical
   (flow by flow) for a user-visible flow. Frontend plans in this repo are
   almost always horizontal for primitives/shells and vertical for a screen.
4. **Task lines** — each carries exact acceptance, `layers`, `evidence` (where
   the result lands) and `size` (S/M). Tasks are PR-sized: each leaves the
   gate green.
5. **Out of scope** — explicit, with a pointer to where the sliver goes.
6. **Open-plan commit command** — the exact `git commit` that opens the plan.

Rules that apply to *all* frontend plans (do not drop them):

- Load the frontend skills before coding (`AGENTS.md` §"Frontend work").
- Every UI change PR ships before/after screenshots (capture script or
  Playwright MCP) in its evidence.
- Run `pnpm turbo run build type-check test`, `pnpm lint` and
  `bash scripts/docs-hygiene.sh` green before claiming a task done.
- Commit the plan alone first (`docs(plans): open <area> v<N> — <goal>`),
  then execute tasks in separate commits.

---

## Example (a) — redesign one primitive component

**Area:** `design-system` · **File:** `docs/plans/design-system/v1.md`

```markdown
# Design system — v1

> Slice: horizontal (component → tests → docs).
> Context: [docs/components/web-pwa.md](../components/web-pwa.md) §Tooling
> baseline, [docs/knowledge/frontend-design-tokens.md](frontend-design-tokens.md).
> Opened: YYYY-MM-DD from ROADMAP "Tracked, not scheduled" + the ModalDialog
> primitive audit.

## Goal

Redesign the `ModalDialog` primitive so it consumes the documented design
tokens (elevation, motion, focus ring, radius) instead of ad-hoc values, and
ships accessible defaults (focus trap, ESC close, `role="dialog"`). Done
means: every existing call site renders unchanged-or-better, the
`web-quality-audit` a11y check is green on a page that uses it, and the
before/after capture diff shows no regression.

## Tasks

- [ ] T1 — Audit current `ModalDialog` usage and token gaps.
  · layers: web · evidence: `docs/components/web-pwa.md` §Primitives (new)
  · acceptance: list every call site of `ModalDialog`; record which tokens it
    hard-codes (shadow, radius, duration, focus ring) vs. which are missing;
    file the gap table. No code change.
  · size: S

- [ ] T2 — Re-point `ModalDialog` at tokens and add a11y defaults.
  · layers: web · evidence: `apps/web/src/lib/components/ModalDialog.svelte`,
    `apps/web/src/app.css`
  · acceptance: uses `--shadow-float`, `--radius-card`, a duration token, and
    the documented focus ring; focus trap + ESC close + `role="dialog"` /
    `aria-modal`; `prefers-reduced-motion` respected; existing call sites
    unchanged.
  · size: M

- [ ] T3 — Evidence + gate.
  · layers: web, devops · evidence: `docs/analysis/screenshots/<YYYY-MM-DD>/`,
    `docs/components/web-pwa.md`
  · acceptance: `capture:screenshots` before/after attached; `web-quality-audit`
    (a11y) green on `/proposals`; `pnpm turbo run build type-check test` +
    `pnpm lint` + `bash scripts/docs-hygiene.sh` green.
  · size: S

## Out of scope (this version)

- Other primitives (`Drawer`, `Sheet`, `OverlayPanel`) →
  `plans/design-system/v2`.
- Dark mode → `plans/design-system/v2` (depends on the token decision).
- A new component library or Storybook → future plan.

## Closure checklist

- [ ] every task's implementation is recorded in its living doc
- [ ] decisions taken during execution became ADRs (only if a contract changes)
- [ ] unfinished slivers copied forward with origin cited
- [ ] docs/README.md snapshot + requirements matrix updated
- [ ] git mv plans/design-system/v1.md docs/archive/plans/design-system/v1.md
```

Open-plan commit command:

```bash
git commit -m "docs(plans): open design-system v1 — redesign the ModalDialog primitive on tokens" -- docs/plans/design-system/v1.md
```

(Add the matching ROADMAP line in the same commit if this is the first plan for
the area.)

---

## Example (b) — refine one screen section

**Area:** `frontend-ux` · **File:** `docs/plans/frontend-ux/v1.md`

```markdown
# Frontend UX — v1

> Slice: vertical (one screen section end to end).
> Context: [docs/components/web-pwa.md](../components/web-pwa.md) §Routing,
> [docs/knowledge/frontend-design-tokens.md](frontend-design-tokens.md).
> Opened: YYYY-MM-DD from ROADMAP "Tracked, not scheduled" + the proposals
> page review.

## Goal

Refine the proposals page filter bar and empty state: align them to the token
system (spacing, typography, focus ring), fix the responsive collapse under
`640px`, and make the empty state actionable. Done means: the filter bar and
empty state pass `web-quality-audit` (a11y + best practices) and the capture
diff at 1440×900 and 390×844 shows the intended change only.

## Tasks

- [ ] T1 — Capture the "before" baseline.
  · layers: web, devops · evidence: `docs/analysis/screenshots/<YYYY-MM-DD>/`
  · acceptance: run `pnpm --filter @vozlab/web capture:screenshots` against a
    running dev server; commit the `/proposals` PNG + HTML at both viewports as
    the "before". No code change.
  · size: S

- [ ] T2 — Refine the filter bar.
  · layers: web · evidence: `apps/web/src/routes/(app)/proposals/+page.svelte`
  · acceptance: filter controls use `--control-height`, `--radius-control`,
    `--color-control-strong` borders and the documented focus ring; collapse to
    a stacked layout under `sm` (`640px`); keyboard-operable (tab order,
    Enter submits); no `text-red-600`-style leaks.
  · size: M

- [ ] T3 — Refine the empty state.
  · layers: web · evidence: `apps/web/src/routes/(app)/proposals/+page.svelte`
  · acceptance: empty state uses `--text-section` title + `--text-body` body +
    `--color-muted`; includes a primary action (clear filters / create node)
    using `btn-primary`; copy reviewed against i18n keys.
  · size: S

- [ ] T4 — Evidence + gate.
  · layers: web, devops · evidence: `docs/analysis/screenshots/<YYYY-MM-DD>/`,
    `docs/components/web-pwa.md`
  · acceptance: before/after captures attached; `web-quality-audit` green on
    `/proposals` (a11y + best practices); `pnpm turbo run build type-check
    test` + `pnpm lint` + `bash scripts/docs-hygiene.sh` green.
  · size: S

## Out of scope (this version)

- Other sections of the proposals page (detail panel, vote ledger) →
  `plans/frontend-ux/v2`.
- Graph canvas changes → `plans/frontend-ux/v2` or a dedicated canvas plan.
- Dark mode → `plans/design-system/`.

## Closure checklist

- [ ] every task's implementation is recorded in its living doc
- [ ] decisions taken during execution became ADRs (only if a contract changes)
- [ ] unfinished slivers copied forward with origin cited
- [ ] docs/README.md snapshot + requirements matrix updated
- [ ] git mv plans/frontend-ux/v1.md docs/archive/plans/frontend-ux/v1.md
```

Open-plan commit command:

```bash
git commit -m "docs(plans): open frontend-ux v1 — refine the proposals filter bar and empty state" -- docs/plans/frontend-ux/v1.md
```

---

## Example (c) — add a new layout shell

**Area:** `layout-shells` · **File:** `docs/plans/layout-shells/v1.md`

```markdown
# Layout shells — v1

> Slice: horizontal (shell → routes → docs).
> Context: [docs/components/web-pwa.md](../components/web-pwa.md) §Routing,
> [docs/knowledge/frontend-design-tokens.md](frontend-design-tokens.md).
> Opened: YYYY-MM-DD from ROADMAP "Tracked, not scheduled" + the admin
> surface review.

## Goal

Add a dedicated `(settings)` route group with its own layout shell (sidebar
nav for settings sections, content pane, breadcrumbs) so settings no longer
share the graph workspace chrome. Done means: `/settings/*` renders under the
new shell, the graph workspace chrome is untouched, the shell passes
`web-quality-audit` (a11y + best practices) and the capture diff shows only
the new routes.

## Tasks

- [ ] T1 — Scaffold the `(settings)` group and layout shell.
  · layers: web · evidence: `apps/web/src/routes/(settings)/+layout.svelte`
    (new)
  · acceptance: new route group with a layout shell reusing `--sidebar-width`,
    `--sidebar-rail-width`, `--gap`, `--pad`; sidebar nav with section links;
    content pane with breadcrumbs; no graph canvas mounted.
  · size: M

- [ ] T2 — Migrate one settings screen into the new shell.
  · layers: web · evidence: `apps/web/src/routes/(settings)/.../+page.svelte`
  · acceptance: one existing settings-flavoured screen (e.g. tenant selector)
    moves into `(settings)` with identical behaviour; old route redirects.
  · size: S

- [ ] T3 — Register routes and update the component doc.
  · layers: web, docs · evidence: `docs/components/web-pwa.md` §Routing
  · acceptance: routing tree in `docs/components/web-pwa.md` §Routing updated
    with the new group; no dead path references (`docs-hygiene` green).
  · size: S

- [ ] T4 — Evidence + gate.
  · layers: web, devops · evidence: `docs/analysis/screenshots/<YYYY-MM-DD>/`
  · acceptance: before/after captures at 1440×900 and 390×844; `web-quality-audit`
    green on a `/settings/*` route; `pnpm turbo run build type-check test` +
    `pnpm lint` + `bash scripts/docs-hygiene.sh` green.
  · size: S

## Out of scope (this version)

- Migrating every settings screen → `plans/layout-shells/v2`.
- Re-skinning the graph workspace chrome → `plans/frontend-ux/`.
- Mobile-native shells → `ios-design` skill only if requested.

## Closure checklist

- [ ] every task's implementation is recorded in its living doc
- [ ] decisions taken during execution became ADRs (only if a contract changes)
- [ ] unfinished slivers copied forward with origin cited
- [ ] docs/README.md snapshot + requirements matrix updated
- [ ] git mv plans/layout-shells/v1.md docs/archive/plans/layout-shells/v1.md
```

Open-plan commit command:

```bash
git commit -m "docs(plans): open layout-shells v1 — add a (settings) route group and layout shell" -- docs/plans/layout-shells/v1.md
```

---

## Choosing between the three

| You want to… | Use example | Slice |
| --- | --- | --- |
| Change one reusable primitive (`ModalDialog`, `Drawer`, `Sheet`, `OverlayPanel`, a `btn`/`field` utility) | (a) | horizontal |
| Polish one section of one shipped screen (filter bar, empty state, inspector pane) | (b) | vertical |
| Introduce a new top-level layout / route group / shell | (c) | horizontal |

In all three cases the plan stays small (3–4 tasks, S/M sizes) and leaves the
gate green after every task. If the work grows past that, split it into v2
rather than inflating v1.
