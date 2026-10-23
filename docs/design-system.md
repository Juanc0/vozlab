# The design system of VozLab

The normative description of how the PWA looks. The code is the authority;
this document explains **why** it looks that way, and the rules a new
surface has to follow.

The direction is not invented here. It is the **accent ladder**, an app
style dealt from a library of measured product screens, with two stated
deviations: the hue is VozLab's own blue in place of the dealt raspberry
(the style's own *face* section offers the ladder built from the brand's
own hue), and the type is IBM Plex instead of the dealt DM Sans.

The palette is arranged in **three rings**:

1. **Principal — VozLab's blue.** The full hue on the marks that act
   (the one filled button, the selection, the relations of the canvas);
   its pale tints do every area of work.
2. **Secundario — the indigo-violet.** A *subordinate* hue (lower
   chroma than the blue, never a second accent) for the governance
   layer: what is waiting for a decision wears it — the `PENDING` mark
   of a node, the dashed relation of a proposal, the badge of an open
   proposal.
3. **Auxiliar — the functional trio.** Green, red and amber with their
   pale pills: success, failure and warning. These never decorate; they
   only report.

Around the rings sit the **neutrals**, tinted with the blue of the brand
(never pure grey — a tint reads as intentional).

## The three layers of the tokens

`apps/web/src/app.css` holds one Tailwind 4 `@theme` block with three
layers.

### 1. The raw palettes

`--color-brand-50…950` and `--color-secondary-50…950`, the two ladders,
kept whole. They are the **source** of the roles and nothing in the
interface refers to them directly. The blue is generated at a fixed hue
with varying lightness and chroma in OKLCH and shipped as sRGB; the
violet is a lower-chroma hue that never competes with it.

### 2. The roles

A role says what a colour *does*, never what it looks like.

| role | value | what it is for |
| --- | --- | --- |
| `--color-ground` | `#f5f8fb` | the page |
| `--color-surface` | `#ffffff` | a panel, a card, a field |
| `--color-raised` | `#eceff5` | a tone step: the hover of a row, a nested panel |
| `--color-border` | `#dce1e8` | the edge of something with no label of its own |
| `--color-rule` | `#e9ecf1` | a rule between sections |
| `--color-control` | `#c0c6ce` | the edge of a control that carries its own label |
| `--color-control-strong` | `#818995` | the edge of a **text field**, whose edge is all that says where to type |
| `--color-text` | `#1b2128` | the running text |
| `--color-muted` | `#656c76` | the meta, the labels |
| `--color-faint` | `#6e757e` | the placeholders |
| `--color-accent` | `#2f72c6` | the full hue: small marks only |
| `--color-accent-hover` | `#2260ad` | the accent under the pointer |
| `--color-accent-soft` | `#f1f6fe` | the 50 tint: the areas |
| `--color-accent-track` | `#dfecfe` | the 100 tint: the tracks |
| `--color-accent-ink` | `#1c4c8a` | the 800: the text on a tint |
| `--color-secondary` | `#6d5fa3` | what waits for a decision |
| `--color-positive` / `--color-negative` / `--color-warning` | `#247b50` / `#c4242a` / `#92400e` | the status colours |

Each status has a **pill pair** (`--color-pill-*-bg` and
`--color-pill-*-ink`): a pale ground with the dark ink of the same hue —
positive, negative, warning, **secondary** (an open proposal) and
neutral.

The names `--color-ink`, `--color-ink-muted`, `--color-line`,
`--color-line-strong` and `--color-surface-muted` **do not exist any more**.
A test fails if one of them comes back, in the stylesheet or in any
component.

### 3. The geometry and the type

`--radius-card: 8px`, `--radius-control: 6px`, `--row-height: 45px`,
`--sidebar-width: 230px`, `--gap: 24px`, `--pad: 24px`,
`--control-height: 32px`, `--container-measure: 56ch`.

The type: `--text-display: 38px/44` (the title of a workspace, on the
picture itself), `--text-title: 32px/38`, `--text-brand: 20px/24` (the
wordmark in the navigation column), `--text-section: 18px/24`,
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

The files are **vendored** in `apps/web/static/fonts/` — the shell is
cached by the service worker, so it opens with its own faces even when the
network is gone. (The product is **online-first**: everything that is shown
or edited comes from the API, and there is no local state and no
synchronisation.) `font-display: swap`, a preload for the two most used
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
| `--color-text` on `--color-surface` / on `--color-ground` | 16.22:1 / 15.22:1 |
| `--color-muted` on surface / ground / raised | 5.30 / 4.98 / 4.60:1 |
| `--color-faint` on surface | 4.66:1 |
| `--color-accent-ink` on `--color-accent-soft` | 7.90:1 |
| the focus ring on the ground / on the tint | 4.54:1 / 4.46:1 |
| white on `--color-accent` (the filled button) | 4.84:1 |
| `--color-secondary` on surface / ground | 5.50 / 5.16:1 |
| the pill pairs (positive / negative / warning / neutral / secondary) | 8.30 / 8.63 / 6.84 / 9.40 / 5.79:1 |
| `--color-control-strong` on surface / ground | 3.53 / 3.31:1 |

`--color-control` on white is 1.72:1, below the 3:1 of SC 1.4.11, so it
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
| the card | an 8px radius, **no edge**, no shadow — its background is a soft tint of the ring it belongs to (principal blue by default, secondary violet on governance surfaces), not pure white |

## The canvas and its cards

The graph is drawn on a **canvas**, and the canvas is the one surface of the
app that is **not** white: it is the **ground** (`--color-ground`). The
nodes are **cards** — a surface (`--color-surface`) with the 8px radius, no
edge and no shadow — so a card is separated from its background by a **tone
step**, exactly like the cards of the interface are.

A card is a **surface**, not a picture: the colour of a node is never its
fill. A card the size of a business card painted in a saturated colour is a
wall of colour, not a picture of a graph — and a fill by status says
nothing, because every node of a healthy graph has the same status.

The **status** of a node is a **mark** on the card: a border of two pixels
in the colour of the status — `--color-secondary` for `PENDING` (it waits
for a decision, and that is not a warning), `--color-negative` for
`REJECTED`, `--color-muted` for `DRAFT`/`MERGED`/`DEPRECATED`. The default
status (`ACTIVE`) wears a **soft brand edge** (one pixel, `brand-300`): the
card carries the hue of the brand at the strength of an edge, and that edge
is not a status mark.

The relations wear the same language: an `ACTIVE` relation is the blue of
the brand at the strength a line needs (3.4:1 on the ground), a `PENDING`
one wears the secondary as a dashed line, a `DRAFT` one is written in the
muted ink, and a rejected one is the negative of the palette.

The **type** of the node is the categorical series of the graph — the
difference between a problem and an idea — and it is the one thing on the
card that says what the node *is*. It is written in the **meta line** under
the title, in the muted ink (`--color-muted`), at the small size. A type
that the ontology does not know keeps its key.

The **rings** are the marks of the **view**, not of the data: the selection
wears the accent — the full hue, with a pale underlay — and the node the
view presents wears a ring in the **ink**. Neither of them is a state of the
node, and neither of them may be mistaken for the mark of the status.

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
