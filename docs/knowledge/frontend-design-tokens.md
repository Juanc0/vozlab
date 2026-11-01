# Frontend design tokens — current state audit

> **Knowledge doc — read-only audit of the Tailwind 4 theme as it ships today.**
> Opened 2026-10-31 from `docs/plans/frontend-tooling/v1.md` T2.
> Graduates when a future `plans/frontend-ux/` or `plans/design-system/` plan
> turns the gaps below into implemented tokens. Until then this document is the
> standing reference; the code (`apps/web/src/app.css`) stays authoritative.
> Companion: `docs/design-system.md` (the house rules and measured contrast).

## 1. Where the theme lives

- **Single source of truth**: `apps/web/src/app.css`. There is **no**
  `tailwind.config.js` / `tailwind.config.ts` — the project uses Tailwind 4's
  CSS-first configuration (`@import 'tailwindcss'` + one `@theme` block).
- Tailwind is wired through `@tailwindcss/vite` in `apps/web/vite.config.ts`.
- `@theme` is declared **once** (lines 100–236 of `app.css`). Everything else
  in the file is `@font-face`, `@utility`, and `@layer base`.
- The default Tailwind 4 theme (`node_modules/tailwindcss/theme.css`) is still
  in effect underneath: `--spacing: 0.25rem`, the five breakpoints, the
  radius/shadow/ease/animate scales, the full standard colour hues and the
  text/leading scales. The custom `@theme` block **overrides** the font,
  spacing base is kept, breakpoints are kept, and adds the VozLab colour roles
  plus geometry and type tokens.
- The PWA manifest `theme_color` is `#183d6c` (`brand-900`), set in
  `vite.config.ts`.

## 2. The `@theme` block, layer by layer

### 2.1 Raw palettes (the two ladders)

| Token family | Steps | Hue / role |
| --- | --- | --- |
| `--color-brand-50 … --color-brand-950` | 11 | Principal blue (interactive / brand) |
| `--color-secondary-50 … --color-secondary-950` | 11 | Secundario indigo-violet (governance, "waiting for a decision") |

Both are shipped as sRGB hex even though they are authored in OKLCH with a
fixed hue. They are the **source** of the roles; nothing in the interface
refers to them directly except the canvas edge (`brand-300`) and the accent
ladder.

### 2.2 Role colours (neutrals + accent + functional trio)

| Token | Value | Role |
| --- | --- | --- |
| `--color-ground` | `#f5f8fb` | page background |
| `--color-surface` | `#ffffff` | panel / card / field |
| `--color-raised` | `#eceff5` | tone step (hover, nested panel) |
| `--color-border` | `#dce1e8` | edge of an unlabelled thing |
| `--color-rule` | `#e9ecf1` | section rule |
| `--color-control` | `#c0c6ce` | edge of a self-labelled control (1.72:1 — below SC 1.4.11, documented) |
| `--color-control-strong` | `#818995` | edge of a text field (3.53:1 on surface) |
| `--color-text` | `#1b2128` | running text |
| `--color-muted` | `#656c76` | meta / labels |
| `--color-faint` | `#6e757e` | placeholders |
| `--color-accent` | `#2f72c6` | full hue, small marks only |
| `--color-accent-hover` | `#2260ad` | accent under pointer |
| `--color-accent-soft` | `#f1f6fe` | 50 tint, areas |
| `--color-accent-track` | `#dfecfe` | 100 tint, tracks |
| `--color-accent-ink` | `#1c4c8a` | 800, text on a tint |
| `--color-secondary` | `#6d5fa3` | what waits for a decision |
| `--color-positive` | `#247b50` | success |
| `--color-negative` | `#c4242a` | failure |
| `--color-warning` | `#92400e` | warning |
| `--color-pill-positive-bg/ink` | `#dcfce7` / `#14532d` | positive pill |
| `--color-pill-negative-bg/ink` | `#ffedea` / `#831c1e` | negative pill |
| `--color-pill-warning-bg/ink` | `#fffbeb` / `#92400e` | warning pill |
| `--color-pill-secondary-bg/ink` | `#e9e6fe` / `#5c508b` | open-proposal pill |
| `--color-pill-neutral-bg/ink` | `#eceff5` / `#363e48` | neutral pill |

Obsolete names (`--color-ink`, `--color-ink-muted`, `--color-line`,
`--color-line-strong`, `--color-surface-muted`) are gone and a test fails if
any comes back.

### 2.3 Geometry

| Token | Value | Note |
| --- | --- | --- |
| `--container-measure` | `56ch` | running-text measure |
| `--radius-card` | `8px` | card / node |
| `--radius-control` | `6px` | control |
| `--row-height` | `45px` | list row |
| `--sidebar-width` | `230px` | navigation column |
| `--sidebar-rail-width` | `56px` | folded rail (44px touch target + air) |
| `--gap` | `24px` | page gap |
| `--pad` | `24px` | page padding |
| `--control-height` | `32px` | control height |

### 2.4 Typography

| Token | Value | Usage |
| --- | --- | --- |
| `--font-sans` | IBM Plex Sans + system fallbacks | interface (all body/control/label) |
| `--font-serif` | IBM Plex Serif + Georgia fallback | titles only (`h1`, `h2`, page title) |
| `--text-display` / `--text-display--line-height` | `38px` / `44px` | workspace title on the picture |
| `--text-title` / `--text-title--line-height` | `32px` / `38px` | page title (`h1`) |
| `--text-brand` / `--text-brand--line-height` | `20px` / `24px` | wordmark in the nav column |
| `--text-section` / `--text-section--line-height` | `18px` / `24px` | section title (`h2`) |
| `--text-kpi` / `--text-kpi--line-height` | `24px` / `30px` | `h1` on phone (`≤ 40rem`) |
| `--text-body` / `--text-body--line-height` | `14px` / `20px` | body (`h3`, default) |
| `--text-small` / `--text-small--line-height` | `12px` / `16px` | meta line |
| `--font-weight-normal/medium/semibold/bold` | 400 / 500 / 600 / 700 | |
| `--tracking-tight` | `-0.02em` | titles |

Fonts are **vendored** in `apps/web/static/fonts/` (SIL OFL 1.1) with
`font-display: swap`; the shell is precached by the service worker, so the
faces render offline.

### 2.5 Elevation

| Token | Value | Usage |
| --- | --- | --- |
| `--shadow-float` | `0 8px 24px rgb(27 33 40 / 0.08)` | floating surfaces only (drawer, sheet, dialog) |

No other shadow token is defined. Everything at rest uses a tone step.

## 3. Breakpoints and responsive strategy

- **Tailwind 4 defaults are kept** (no override in `@theme`):
  `sm 40rem` (640px), `md 48rem` (768px), `lg 64rem` (1024px),
  `xl 80rem` (1280px), `2xl 96rem` (1536px).
- **App-level media queries** in `@layer base`:
  - `@media (max-width: 40rem)` — `h1` drops to `--text-kpi` (24px) on phone.
  - `@media (pointer: coarse)` — touch targets `min-height/min-width 2.75rem`
    (44px) on coarse pointers.
  - `@media (prefers-reduced-motion: reduce)` — all animation/transition
    durations collapse to `0.01ms`.
- Responsive usage in components is light: `sm:`/`lg:`/`xl:` appear on a
  handful of layout grids and padding; most screens are single-column with the
  sidebar as the only responsive chrome. Several components use arbitrary
  max-widths (`max-w-[32rem]`, `max-w-[39rem]`, `max-w-[48rem]`) instead of
  the container scale.

## 4. Dark mode strategy

**There is none.** `html { color-scheme: light; }` is hard-coded in
`@layer base`. There is no `.dark` class, no `prefers-color-scheme` branch,
no theme switching, and no dark token set. The manifest `theme_color` is fixed
to `#183d6c`. This is a deliberate (current) limitation: the app is
light-only.

## 5. Motion

- `@utility btn` transitions `background-color`, `border-color`, `color` over
  `120ms ease`.
- Two component-level uses of `duration-200` (Tailwind default 200ms).
- No motion tokens (`--duration-*`, `--ease-*` custom) — durations and
  easings are hard-coded per site.
- Global `prefers-reduced-motion` handling exists (see §3).
- `transition-duration` default from Tailwind is `150ms`.

## 6. House utilities (`@utility`)

Defined in `app.css`: `btn`, `btn-primary`, `btn-secondary`, `btn-quiet`,
`field`, `field-area`, `field-label`, `skeleton`. These encode the control
geometry (`--control-height`, `--radius-control`) and the single-filled-button
rule.

## 7. Gaps vs. industrial standard

| Area | Current state | Gap | Severity |
| --- | --- | --- | --- |
| **Dark mode** | Light-only; `color-scheme: light` hard-coded | No dark token set, no toggle, no `prefers-color-scheme` branch. Blocks any dark requirement and forces a re-audit later. | High |
| **a11y contrast — `--color-muted` on `--color-raised`** | 4.60:1 | Passes AA (4.5) by 0.10 — no headroom; a small background change breaks it. | Medium |
| **a11y contrast — `--color-faint` on surface** | 4.66:1 | Same margin; placeholders are borderline. | Medium |
| **a11y contrast — `--color-control`** | 1.72:1 on white | Documented as "below 3:1, only for self-labelled controls", but nothing enforces usage; a misuse is invisible to review. | Medium |
| **a11y — non-token colour leak** | `text-red-600` in `select-tenant/+page.svelte` | Bypasses the role system (`--color-negative` exists for this); the only such leak found. | Low |
| **Token naming** | Mixed schemes: `--color-*`, `--text-*`, `--font-*`, `--shadow-*`, `--radius-*`, plus bare `--gap`, `--pad`, `--row-height`, `--control-height` | No consistent namespace (`--space-*`, `--size-*`, `--motion-*`). Geometry tokens are not grouped, making discovery and overrides hard. | Medium |
| **Motion scale** | `120ms` (btn), `200ms` (`duration-200`), `150ms` default; hard-coded | No `--duration-*` / `--ease-*` tokens; no documented motion scale (fast/base/slow) or reduced-motion per-component fallback. | Medium |
| **Elevation scale** | Single `--shadow-float` | No 0–4 elevation ladder; "tone step vs. float" is a rule, not a tokenised scale, so new surfaces invent shadows. | Low–Medium |
| **Density** | One density (`--control-height: 32px`, `--row-height: 45px`) | No compact/comfortable scale; touch-target rule is coarse-pointer only. Desktop density is fixed. | Medium |
| **Spacing documentation** | Default Tailwind scale (`0.25rem` base) reused via `p-4`, `gap-3`, etc. | No project spacing tokens; arbitrary values (`px-7`, `space-y-1.5`) and ad-hoc max-widths (`[32rem]`) drift from the 24/12/8 grid implied by `--gap`/`--pad`. | Medium |
| **Responsive breakpoints** | Default Tailwind breakpoints kept; only `h1` adapts at `40rem` | No documented layout breakpoints for the sidebar (230px) / right rail (384px) / page (1152px) geometry; responsive behaviour is implicit. | Medium |
| **Focus ring** | `2px solid var(--color-accent)`, offset 2px | Only one ring style; no high-contrast / forced-colors handling; no `:focus-visible` fallback for older browsers beyond the native outline. | Low |
| **Typography scale** | Custom px sizes (12–38) with hand-set line-heights | Not aligned to a modular scale or to Tailwind's `--text-*` defaults; mixing px tokens with rem utilities. | Low |
| **Radius scale** | `--radius-card 8px`, `--radius-control 6px`, plus `3px` (skeleton) and Tailwind defaults | Skeleton radius (`3px`) is not tokenised; ad-hoc. | Low |
| **Color-scheme / PWA** | `theme_color: #183d6c` matches `brand-900` | Fine, but no dark variant for the OS chrome; consistent with the light-only decision. | Low |

## 8. Evidence

- `apps/web/src/app.css` (488 lines): single `@theme` (100–236), `@utility` (245–363), `@layer base` (365–488).
- `apps/web/package.json`: `tailwindcss ^4.3.3`, `@tailwindcss/vite ^4.3.3`; no `tailwind.config.*`.
- `apps/web/vite.config.ts`: `theme_color: '#183d6c'`.
- `docs/design-system.md`: house rules, measured contrast table, geometry of the screen.
- Audit commands used (read-only):
  - `grep -rn 'dark:' apps/web/src` → no matches.
  - `grep -rn 'text-red-600' apps/web/src` → one leak in `select-tenant/+page.svelte`.
  - `grep -rhoE '(sm|md|lg|xl|2xl):…'` → light responsive usage.

## 9. Graduation path

This audit graduates into a `plans/design-system/` (or `plans/frontend-ux/`) plan that
(a) introduces a token namespace (`--space-*`, `--motion-*`, `--elevation-*`,
`--radius-*`), (b) decides on dark mode (yes/no + token set), (c) replaces the
`text-red-600` leak with `--color-negative`, and (d) documents a density scale.
No code changes ship from this document.