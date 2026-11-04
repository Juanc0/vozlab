# M03 — Colour systems

Colour is the most abused tool in frontend because it is the easiest to
apply without thinking. This module is about the structure underneath
colours — the system that makes "what colour should this be" a lookup, not
an opinion.

> Interactive diagram: [`diagrams/m03-layers.html`](../diagrams/m03-layers.html) — open it and press Live.

## The concept

**Palette vs role.** A palette is a list of colours (`blue-600: #2563eb`).
A role is a contract (*accent*: the one hue of the brand, on the small marks
that ask for a decision). Components must be written in roles and never
touch the palette. The reason is mechanical: when the brand changes, or dark
mode arrives, or a client wants their own tint, only a role system lets you
re-map one layer and keep the app coherent. Every real design system —
Material, Carbon (IBM), Polaris (Shopify), Fluent (Microsoft) — is built on
semantic tokens with exactly this split (primitive → semantic → component).

**The accent ladder.** One hue at full saturation on the few elements that
must be seen as *actions* (the primary button, the active nav mark, the
selected state, one data series), and its pale tints for *areas* of that
same meaning (the active row's background, a badge, a progress track). The
ladder's virtue: the app reads as one colour story instead of a box of
crayons, and "this is where you act" survives even in greyscale. VozLab's
`--color-accent-soft / -track / -ink` are precisely the ladder's rungs.

**Semantic colour is reserved.** Red, green, amber mean *the system needs a
decision or tells you an outcome* — approve/reject, pass/fail, warning. If
red also appears as a chart series or a decorative tag, the alarm value is
gone. The professional budget is ruthless: semantic hues appear only at the
point of the decision (a pill on a pending proposal, the destructive
button's label), never as chrome.

**Grey is a system, not a colour.** A UI is ~90% neutrals. Those need their
own ladder with perceptually even steps — the failure of naive greys is
that `#333` on `#f9fafb` and `#333` on `#fff` look different "warmths." The
fix is either a vetted ramp (Tailwind's `gray`/`zinc`/`slate`) or a
perceptual model (OKLCH). Note the subtlety already in your tokens: the
neutrals carry a faint blue tint (`#5f6672`, `#7d8798`) so the interface
harmonises with the brand hue instead of looking dirty — that is the
"cool grey" decision made once, at the token layer.

**Contrast is two rules, not one.** WCAG 1.4.3: text ≥4.5:1 (≥3:1 for
large). WCAG 1.4.11 *non-text*: any UI part whose absence would hide
information — a checkbox, an input's edge, an icon, a chart's essential
series — ≥3:1 against what's behind it. The classic miss: a disabled-looking
grey input edge at 2:1 passes "it's grey" in the eye and fails 1.4.11 in
audit. Your `--color-control-strong` comment (3.6:1, because a text
field's edge *is* the affordance) shows the rule already understood; the
course gives it a name so it gets defended in review.

**Dark mode is not an inversion.** It is a second role mapping: surfaces get
elevation by lightness (a raised panel is *lighter*, not shadowed), the
accent usually needs a step or two lighter to keep contrast, and saturated
backgrounds must desaturate or they vibrate. A system that stores roles
swaps mappings; a system that stores hex codes gets rebuilt.

**The map at a glance:**

```mermaid
flowchart LR
  P["Raw palette · brand-50…950 + greys"] --> R["Roles · what a colour DOES"]
  R --> A["accent — the one filled button · active marks"]
  R --> SM["positive · negative · warning — decision points only"]
  R --> N["ground · surface · raised · border — the quiet 90%"]
  A --> C["Components — written only in roles · zero hex"]
  SM --> C
  N --> C
  C -- "graph surfaces use" --> CX["Canvas series palette — separate · capped · hue never alone"]
  DM["Dark mode"] -.-> "re-map the roles · rewrite no component" --> R
```

## The reasoning

**Why tools limit hue count.** Each additional hue in an interface taxes the
user's classification effort — "what does orange mean here?" — and a tool
already taxes reading, memory, and decisions. Linear, Notion, Vercel, and
most mature dashboards run on one brand hue + a semantic trio + greys.
Multi-hue products (Figma's labels, Google Calendar) spend a legend and an
onboarding to carry that hue, and they are consumer-scale. A university
tool cannot afford the tax: D-rule below.

**Why colour-as-data is different.** On the graph canvas, colour is an
information channel (node types, states, edge kinds). It obeys different
rules: each series needs 3:1 against the canvas, the palette must be
distinguishable for the ~8% of men with colour vision deficiency (so hue
alone never carries meaning — pair with shape, position, or a label), and
the count of usable series saturates around 5–7. The canvas is where colour
budgets go to die; it needs its own token set, separate from the UI roles.

## Decision rules

1. **Components reference roles only.** A hex code or `brand-500` in a
   component is a review blocker.
2. **One brand hue; its ladder does action and selection. Semantic red/
   green/amber only where an outcome or decision lives.**
3. **Every text/edge pair carries a measured contrast** (4.5/3/3 ratio per
   1.4.3 and 1.4.11) documented once per role; new roles get the number.
4. **Meaning never rides on hue alone** — pair with shape/label/icon
   (colour-blind safe).
5. **Graph series colours are a separate, named palette** with a maximum
   series count; a series is never a semantic UI colour (red on the canvas
   must not look like a rejection pill).
6. **Dark mode is planned as a role re-mapping or explicitly not done**;
   half-dark (one screen inverted in a light app) is worse than neither.

## VozLab today

Rules 1–3 are already true of the token layer (the roles, the ladder, the
3.6:1 field edge). The open fronts are 5 and 2: the canvas node/edge
colours live in graph components, not in the `@theme`, and there is no
stated budget of how many node types may own a hue. Also `--color-faint:
#6b6b6b` — placeholder grey — sits at ~4.7:1 on white, which is fine, but
against `--color-raised` it drops; placeholder text at exactly the floor is
fragile (D4).

## Exercise

1. Grep for hex codes and `brand-` tokens used in `.svelte` files (not
   `app.css`). Each hit is rule 1 debt; list them.
2. Extract the canvas's node/edge colours; check them pairwise against the
   canvas ground for 3:1, and run a deuteranopia simulator on a screenshot
   (free tools exist) to see which node types collapse.
3. *Handoff to the cheap model:* "Move the graph's node-type colours into a
   `@theme` block named `--color-series-1…n` with a comment stating the max
   series count and the contrast of each against `--color-ground`; no
   component may keep a literal colour; produce the M03 rule checklist."

## Decide

**D4. Placeholders.** Keep `faint` as-is, or raise placeholder contrast to
≥5:1? (Placeholders are the most-read small text in forms.)

**D5. The canvas palette.** How many node types may carry colour, and do we
draw the line there (types beyond n get neutral + shape)? This is the single
biggest colour decision in the product, because the graph is the product.
