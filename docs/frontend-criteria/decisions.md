# Decisions — VozLab frontend

The case law produced by [the course](README.md). One entry per call: it
names the module, states the decision, the reason, and what it implies in
code. Pending entries are the ballot — each has the options and a
recommendation; picking one is the entire homework of a module.

Format:

```
## D# — Title  (module: M##)
Status: pending | decided | superseded by D#
Decision: <what we chose>
Reason: <why — one or two lines, the argument, not the taste>
Implications: <files, rules, or follow-ups this commits us to>
```

---

## D1 — Canvas vs panels: the winner  (M01)
Status: pending
Options: (a) the graph is always the winner — panels stay quiet (surface +
hairline, no filled control inside them until focus); (b) focus moves the
crown — selecting a node makes the inspector the winner by elevation.
Recommendation: (a) as the resting state with (b) layered only while an
object is selected — the canvas is the product's object; chrome never
outshines it.

## D2 — Mono face for identifiers and data  (M02)
Status: pending
Options: (a) vendor IBM Plex Mono; IDs, slugs, tokens, stream keys in it.
(b) no mono; sans + `tabular-nums` only.
Recommendation: (a) — a graph tool whose users read IDs by eye; one extra
subsetted woff2 is a small price for the crispness and the role clarity.

## D3 — The 12px role  (M02)
Status: pending
Options: (a) keep with the audited rule "glanced meta only, never body."
(b) raise the floor to 13px.
Recommendation: (a), plus the audit (exercise 1) that proves no read-text
uses it.

## D4 — Placeholder contrast  (M03)
Status: pending
Options: (a) keep `--color-faint` at its current ~4.7:1; (b) raise to ≥5:1.
Recommendation: (b) — placeholders are the most-read small text in forms;
the floor exists to be cleared with margin, not grazed.

## D5 — Canvas series palette  (M03)
Status: pending
Options: how many node types carry hue, and what types beyond n get
(neutral + shape). Requires the exercise audit of current series colours.
Recommendation: cap at the number that survives a deuteranopia check; the
cap is a product decision about how many ontology families must be visible
at a glance.

## D6 — The shell's identity  (M04)
Status: pending
Options: (a) fixed sidebar everywhere (workspace with pages);
(b) rail+canvas+inspector on the exploration screen (tool with a work
surface); (c) collapsible, user decides.
Recommendation: (b) for the canvas route specifically — object-centric
screens earn their width for the object.

## D7 — Overlay policy  (M04)
Status: pending
Map each of the five overlay components to one ladder rung; merge or retire
the extra. Recommendation: audit first (exercise 3), then a one-line
contract per rung into the design system.

## D8 — Loading inside controls  (M05)
Status: pending
Options: (a) spinner-in-place with fixed min-width; (b) disabled with label
kept; (c) view-level skeleton.
Recommendation: (a), and it needs a `btn` min-width rule so the swap never
shifts a row (CLS, M10).

## D9 — The optimistic boundary  (M06)
Status: pending
Options: (a) nothing optimistic; (b) low-severity writes optimistic,
irreversible ones confirmed with a working state; (c) everything including
merges.
Recommendation: (b). The exercise's mutation table is the ballot; each
mutation lands in one of the three columns and the brief records it.

## D10 — URL as state  (M07)
Status: pending
Options: (a) selection + filters + viewport + panel in the URL;
(b) client-only; (c) selection only.
Recommendation: (a) or (c) — for a knowledge tool, "link to this node" is
a feature; (c) is the honest minimum if (a)'s back-semantics are not
designed now.

## D11 — Mixed components  (M07)
Status: pending
Split container/content as scheduled refactors or on-next-touch.
Recommendation: on-next-touch, but the census (exercise 2) is written now —
it is the map for safe delegation.

## D12 — Cache keys and the workspace  (M08)
Status: pending
Adopt a keyed query layer with `(workspace, key)` tuples and one owner, or
stay with component fetches until offline forces the layer.
Recommendation: adopt — it is a prerequisite for D13 and the offline phase,
and the cross-tenant display risk is real if any cache lacks the key.

## D13 — Push channel for the canvas  (M08)
Status: pending
Options: (a) SSE with reconnect-resync; (b) 15–30s polling while visible;
(c) manual + optimistic local only.
Recommendation: decide with the product question it actually encodes: will
multiple people govern one graph at once? Yes → (a), and it is the app's
first realtime feature.

## D14 — Offline data lifecycle  (M09)
Status: pending
What logout deletes (node cache, queued mutations, drafts — all, per
workspace) and what survives (locale, theme, panel layout). Decide before
the PWA 3.6 build so the feature is written against the rule.

## D15 — Canvas accessibility scope  (M10)
Status: pending
Options: (a) full keyboard/ARIA operation of the graph; (b) declare the
list view the a11y-complete surface, canvas the enhancement; (c) defer,
note the gap.
Recommendation: (b) — parity list view is the pragmatic professional
answer for a public institution; (a) as a later phase if a real user needs
it.

## D16 — The style stance  (M11)
Status: pending
Sign: dense tool for working surfaces, editorial voice (serif titles),
quiet-minimal for auth/settings, warmth only in empty/first-run moments.
Recommendation: sign, or open a named fight with the school argument.

## D17 — Where the brief lives  (M12)
Status: pending
`design-system.md` section vs `frontend-criteria/brief.md` cross-linked.
Both fine; pick when writing it (M12 exercise 1).

## D18 — Safe-area and thumb geography pass  (M13)
Status: pending
Options: adopt rules M13-2/3 as the shell's next work unit (`env(safe-area-inset-*)`
on shell/sheets/fixed bars; primary actions in the bottom/centre thumb zone on
phones; destructive away from the affirmative tap-path) or defer.
Recommendation: adopt — small diff, the most *felt* mobile fix, and the PWA
installs on notched phones sooner than later.

## D19 — Canvas on touch: the phone's job  (M13)
Status: pending
Options: (a) phone = view-and-approve (select, read, approve; authoring is
desktop); (b) full parity including edge creation on touch; (c) view-only
today.
Recommendation: (a) — it unlocks the approve-on-the-bus workflow without
pretending edge authoring works under a thumb; (b) after pinch/tap-target
work per M16-3.

## D20 — Button-order convention  (M14)
Status: pending
Options: (a) affirmative left on desktop dialogs, affirmative first on mobile
sheets; (b) affirmative right on desktop, bottom on mobile; (c) standardise
on whatever the current majority does.
Recommendation: (a) with the destructive always last — read order is the most
defensible for a new product, and consistency is the only thing that actually
matters.

## D21 — The approve cost cut  (M14)
Status: pending
Options: (a) row-level quick-approve in the proposals list (≤2 interactions
from the shell); (b) keep review-before-approve as deliberate friction for
governance.
Recommendation: decide with D23 — batch quick-approve for *low-risk* items
plus full review for consequential ones gives both speeds honestly; the
moderator's queue is the product's bottleneck.

## D22 — Error-copy standard  (M15)
Status: pending
Map every reachable ERROR_CODE to a per-screen human sentence (what + why +
next, no codes, no blame, and never ambiguous about what did/didn't happen).
Recommendation: yes, before the pilot — governance trust lives in these
messages, and the audit table (M15 exercise 1) is one work unit.

## D23 — Governance attention design  (M15)
Status: pending
Options: (a) risk-ordered queue + batch low-risk + diff-first everywhere;
(b) chronological status quo; (c) oldest-first fairness.
Recommendation: (a) — reviewer fatigue is a design material (vigilance
decrement); needs a risk signal from the API, which is a small backend ask
and pairs with D21.

## D24 — Rendering strategy of the canvas  (M16)
Status: pending
Options: (a) keep SVG + viewport culling + label LOD + batched writes, with
a node-count ceiling that auto-switches engine; (b) sigma/WebGL primary,
SVG below N; (c) measure first on the dev engines page.
Recommendation: (a) — SVG's DOM events/text/labels are real gifts at
500–2000 nodes; the cliff just has to be known, measured (M16 exercise 2),
and enforced.

## D25 — Pilot measurement  (M17)
Status: pending
Instrument the core-task metrics (approve time + interactions, search
success) and adopt SUS or UMUX-Lite as the release baseline before external
users.
Recommendation: yes — 30 users without a baseline is 30 anecdotes; with
before/after numbers it is a case study the university can fund.

## D26 — Long-task discipline for paint + hydration  (M18)
Status: pending
Options: (a) chunk over-budget tasks inline (scheduler.yield/setTimeout);
(b) a Web Worker for heavy data-shaped computation; (c) measure first and
fix only tasks the trace proves are over ~50ms.
Recommendation: (c) then (a) — a worker is an architecture decision made
against data, not vocabulary; chunking repairs without new structure. The
M16 exercise 1 trace on a busy graph is the evidence base.
