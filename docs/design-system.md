# The design system of VozLab

The normative description of how the PWA looks. The code is the authority;
this document explains **why** it looks that way, and the rules a new
surface has to follow.

The direction is not invented here. It is the **accent ladder**, an app
style dealt from a library of measured product screens, with two stated
deviations: the hue is VozLab's own blue in place of the dealt raspberry
(the style's own *face* section offers the ladder built from the brand's
own hue), and the type is IBM Plex instead of the dealt DM Sans.

## The three layers of the tokens

`apps/web/src/app.css` holds one Tailwind 4 `@theme` block with three
layers.

### 1. The raw brand palette

`--color-brand-50…950`, the Tailwind `blue` scale, kept whole. It is the
**source** of the ladder and nothing in the interface refers to it
directly.

### 2. The roles

A role says what a colour *does*, never what it looks like.

| role | value | what it is for |
| --- | --- | --- |
| `--color-ground` | `#f9fafb` | the page |
| `--color-surface` | `#ffffff` | a panel, a card, a field |
| `--color-raised` | `#f3f4f6` | a tone step: the hover of a row, a nested panel |
| `--color-border` | `#e5e7eb` | the edge of something with no label of its own |
| `--color-rule` | `#f2f2f2` | a rule between sections |
| `--color-control` | `#d1d5db` | the edge of a control that carries its own label |
| `--color-control-strong` | `#7d8798` | the edge of a **text field**, whose edge is all that says where to type |
| `--color-text` | `#111827` | the running text |
| `--color-muted` | `#5f6672` | the meta, the labels |
| `--color-faint` | `#6b6b6b` | the placeholders |
| `--color-accent` | `#2563eb` | the full hue: small marks only |
| `--color-accent-soft` | `#eff6ff` | the 50 tint: the areas |
| `--color-accent-track` | `#dbeafe` | the 100 tint: the tracks |
| `--color-accent-ink` | `#1e3a8a` | the 900: the text on a tint |
| `--color-positive` / `--color-negative` / `--color-warning` | `#247b50` / `#c4242a` / `#92400e` | the status colours |

Each status has a **pill pair** (`--color-pill-*-bg` and
`--color-pill-*-ink`): a pale ground with the dark ink of the same hue.

The names `--color-ink`, `--color-ink-muted`, `--color-line`,
`--color-line-strong` and `--color-surface-muted` **do not exist any more**.
A test fails if one of them comes back, in the stylesheet or in any
component.

### 3. The geometry and the type

`--radius-card: 8px`, `--radius-control: 6px`, `--row-height: 45px`,
`--sidebar-width: 230px`, `--gap: 24px`, `--pad: 24px`,
`--control-height: 32px`, `--container-measure: 56ch`.

The type: `--text-title: 32px/38`, `--text-section: 18px/24`,
`--text-kpi: 24px/30`, `--text-body: 14px/20`, `--text-small: 12px/16`.

## The accent ladder

**One hue. The full strength appears on small marks only**: the one filled
button, the active navigation icon, the data series. Its pale tints do
every area of work: the active navigation row, the badges, the tracks.

**Running text is in the ink, never in the accent.** A row of a list is a
row, not inline prose: its title is `--color-text`, and the accent arrives
when you point at it (the hover) or when it is the current one (the pale
tint and the accent's dark ink). An **inline** link inside a sentence keeps
the accent — there, the colour is doing its job, because the reader has to
know it is a link before pointing at it.

The accent's share of a screen is measured, not estimated: on the
proposals page, **zero** leaves of text are painted in the full accent.

## The type

**IBM Plex Sans** for the interface, **IBM Plex Serif** for the titles
(`h1`, `h2` and the page title). Two families, never three; monospace only
for a pseudonym, an id or a real code block.

The files are **vendored** in `apps/web/static/fonts/` — the PWA is
offline-first and the shell must render with its own faces when the
network is gone. `font-display: swap`, a preload for the two most used
faces, and the SIL Open Font License 1.1 next to the files.

## The house rules

These are the rules the taste skill's library measured on real product
screens, and they hold for every surface:

- **No gradients.** Not a background, not a button, not a piece of text.
- **No shadow on anything at rest.** The elevation is a tone step. A
  shadow is only for what truly floats: a menu, a dialog, the drawer, the
  sheet (`--shadow-float`).
- **No thin rules and no 1px outlined boxes** where a tone step does the
  job.
- **No tiny uppercase letter-spaced labels.** Sentence case, at a readable
  size.
- **No eyebrow labels** — no small label above a heading.
- **No pill badges, no icons in tinted squares, no card grids of identical
  items, no glass.**
- **One filled button in the whole interface.**
- **A focus ring that is visible on every surface.**

## The measured contrast

| pair | ratio |
| --- | --- |
| `--color-text` on `--color-surface` / on `--color-ground` | 17.74:1 / 16.98:1 |
| `--color-muted` on surface / ground / raised | 5.78 / 5.54 / 5.26:1 |
| `--color-faint` on surface | 5.33:1 |
| `--color-accent-ink` on `--color-accent-soft` | 9.52:1 |
| the focus ring on the ground / on the tint | 4.95:1 / 4.75:1 |
| white on `--color-accent` (the filled button) | 5.17:1 |
| the pill pairs (positive / negative / warning / neutral) | 8.30 / 8.63 / 6.84 / 9.37:1 |
| `--color-control-strong` on surface / ground | 3.63 / 3.47:1 |

`--color-control` on white is 1.47:1, below the 3:1 of SC 1.4.11, so it
is only used for the edge of a control that carries its own label. The
edge of a **text field** uses `--color-control-strong`.

## The geometry of the screen

| | |
| --- | --- |
| the top bar | 64px, the ground, a 1px rule below, sticky |
| the navigation column | 230px, a rule on the right, sticky, a 28px gutter |
| the right rail | 384px, flat, no border, no shadow |
| the page | 1152px |
| the measure | 56ch on every running text |
| the row | 45px |
| the control | 32px, a 6px radius |
| the card | an 8px radius, **no edge**, no shadow |

## The states

Hover, focus, active, loading, empty and error are part of the design, not
leftovers. The loading state is **flat grey bars at the real size**, so
the layout does not move when the data arrives. The error state is the
pill pair. The empty state is a dashed box in the border colour with one
line of copy.

## The rules for a new surface

1. The tokens only. A component never writes a colour that is not a role.
2. The title is the serif; nothing else is.
3. The accent is scarce: one filled button, the active icon, the data.
4. The elevation is a tone step.
5. Every string goes through the dictionary, in **both** languages.
6. The contrast is measured, the touch target is 44 × 44 px on a touch
   device, and `prefers-reduced-motion` still switches the motion off.

## The detector

```bash
.agents/skills/impeccable/scripts/impeccable detect --json apps/web/src
```

It is run **once**, at the end of a batch that changed the interface.
