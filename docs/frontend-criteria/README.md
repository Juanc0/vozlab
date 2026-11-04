# Frontend criteria — an express course for deciding, not for admiring

This is a course for the person who has to say *yes, this, because X* about
the VozLab web app: layout, type, colour, components, interactions, data
flow, storage, security. It is not a course about making things pretty. The
goal is **criterio**: knowing what the options are, what each one costs, and
which one fits the work the user does — so that every change we ship is a
decision with a reason, not a taste.

You (Juan) read the modules and make the calls. A cheaper model runs the
exercises and the first drafts of the implementation. This directory is the
contract between the two: the modules say what to think, `decisions.md` says
what was decided, and the decision template below says how to hand either to
another model without losing the thread.

## How the course is built

Seventeen modules and one workshop (M12), in dependency order — each one
assumes the previous ones. M01–M11 are the core; M13–M15 cover touch,
interaction cost and attention; M16 and M18 are the machine under the UI
(the render pipeline, the JavaScript runtime and its memory); M17 is the
literacy that outlives this project (research, measurement, ethics, scale):

| # | Module | The question it lets you answer |
| --- | --- | --- |
| M01 | [Visual foundations](modules/m01-visual-foundations.md) | Why does this screen read in the right order? |
| M02 | [Typography and voice](modules/m02-typography.md) | What faces, what scale, and why our serif is titles-only? |
| M03 | [Colour systems](modules/m03-colour.md) | Roles vs palettes, accents, dark mode, contrast rules. |
| M04 | [Layout and grids](modules/m04-layout.md) | Sides, grids, split panes, modals vs drawers, responsive. |
| M05 | [Component anatomy](modules/m05-components.md) | What a control must contain; states; density. |
| M06 | [Interaction and motion](modules/m06-interaction.md) | Feedback, timing, skeletons, optimistic UI. |
| M07 | [Frontend architecture](modules/m07-architecture.md) | SvelteKit: where logic lives, how state is shaped. |
| M08 | [Feeding the frontend](modules/m08-data.md) | REST vs SSE vs websockets, caching, server vs client state. |
| M09 | [Storage and security](modules/m09-storage-security.md) | Cookies, tokens, XSS, CSRF — and why our token is in memory. |
| M10 | [Accessibility and performance](modules/m10-a11y-performance.md) | The professional floor: WCAG, targets, Core Web Vitals. |
| M11 | [The styles of the trade](modules/m11-style-schools.md) | The seven schools, their reasons, when each one fails. |
| M12 | [Workshop: the brief of VozLab](modules/m12-workshop.md) | Write our own rules down; replace opinion with policy. |
| M13 | [Mobile and responsive ergonomics](modules/m13-mobile-responsive.md) | Thumb zones, safe areas, keyboards, touch feedback — what is bad on mobile and what helps. |
| M14 | [Interaction cost](modules/m14-interaction-cost.md) | Clicks, steps, forms, button order, undo vs confirm — the budgets a flow must fit. |
| M15 | [Attention, fatigue, and feedback](modules/m15-attention-feedback.md) | Centrality, change blindness, error copy, Nielsen's heuristics, micro-animations as acknowledgment. |
| M16 | [The render loop](modules/m16-render-loop.md) | Frame budget, layout thrashing, SVG vs canvas vs WebGL, React vs Svelte render models. |
| M17 | [The long view](modules/m17-long-view.md) | Research, measurement, dark patterns, systems at scale, i18n — literacy beyond this project. |
| M18 | [The JavaScript runtime](modules/m18-event-loop-memory.md) | Event loop, stacks vs queues, closures, GC, workers — how JS actually processes things and where its memory lives. |

Read order is M01→M11, then M13→M18, then M12 (the workshop closes the
core), with M17 as the long-term companion to return to later. If you are
in a hurry, M01+M03+M05 are the ones that most change how a screen is
judged; M07–M09 are the ones that most change how the app survives contact
with real users; M13–M15 are the ones that most change how the app *feels*
to a person with a thumb and a deadline.

## How each module is read

Every module has the same shape:

- **The concept** — the minimum vocabulary, defined once, plainly.
- **The reasoning** | *why a professional does it this way* — the trade-offs
  and the failure modes, with named products as evidence.
- **Decision rules** — the checklist you actually apply. These are the parts
  a reviewer (human or model) can hold code against.
- **VozLab today** — where the current code stands and why. Sometimes the
  code is right and we only needed the words; sometimes the gap is pointed
  out.
- **Exercise** — a small, concrete task on our own app. The cheap-model
  version of each exercise is written to be handed over verbatim (see the
  handoff template).
- **Decide** — the 1–3 choices this module asks of you. One line of context
  plus the options is enough for me to judge a draft; the choice is yours.

## Running it with a cheaper model

The modules are self-contained on purpose. To use a weaker model as the
hands while you keep the head:

1. Pick one module and one decision you have already made (from
   `decisions.md`).
2. Hand it the module file, `docs/design-system.md`, and the handoff
   template below. Do not paraphrase — the wording of the rules is the
   point.
3. Let it produce a diff against the narrowest surface the module names.
4. You review it against the module's Decision rules checklist, not against
   your eye. A checklist the model can see is what makes it pass.

Handoff template (paste as-is, fill the blanks):

```
Read these files completely before touching anything:
- docs/frontend-criteria/modules/<module>.md (the rules you must satisfy)
- docs/design-system.md (the tokens that exist; do not invent new ones)
- <the files you are allowed to change>

Task: <one sentence>.
Constraints: only the files listed; no new dependencies; no new colours or
radii or font sizes — use the existing tokens; the change must keep every
test passing.
Deliver: the diff, plus a checklist mapping each Decision rule in the
module to the part of the diff that satisfies it (or "n/a" with a reason).
```

If the model cannot produce the checklist honestly, it does not understand
the change; send it back to the module, not to the code.

## Where the output lands

- `decisions.md` — every call we make, as D1, D2…, with its reason and the
  module that informed it. This file is the deliverable of the course: the
  rules VozLab follows, stated. Implementation follows it, not the other
  way.
- **Interactive diagrams** — `diagrams/README.md` indexes one animated
  archify page per lesson (17 for the 18 modules — M16/M18 share the
  event-loop page): Live traces, dark/light, cards with the module's key
  rules. Each module links its page at the top; every module also carries
  its model as an embedded mermaid map.
- Changes to `apps/web` — only after a decision, and reviewed as a work
  unit.

## Progress

Track yourself honestly; the point is not to finish.

| Module | Read | Decisions made | Notes |
| --- | --- | --- | --- |
| M01 | ☐ | | |
| M02 | ☐ | | |
| M03 | ☐ | | |
| M04 | ☐ | | |
| M05 | ☐ | | |
| M06 | ☐ | | |
| M07 | ☐ | | |
| M08 | ☐ | | |
| M09 | ☐ | | |
| M10 | ☐ | | |
| M11 | ☐ | | |
| M12 | ☐ | | |
| M13 | ☐ | | |
| M14 | ☐ | | |
| M15 | ☐ | | |
| M16 | ☐ | | |
| M17 | ☐ | | |
| M18 | ☐ | | |
