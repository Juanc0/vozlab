# Interactive diagrams

One animated archify page per lesson (17 modules → 17 diagrams, some
shared where two lessons teach one machine). Open any file in a browser:
dark/light themes, and the **Live** button traces the flow so you can
*watch* order instead of reading it. Use each page after reading its
module — the mermaid maps inside the markdown are the same models at
rest; these are the models in motion.

| Lesson | Diagram | What it teaches |
| --- | --- | --- |
| M01 | [m01-squint.html](m01-squint.html) | The squint test as a decision path: winner → grouping → measured contrast, with the two classic re-asks. |
| M02 | [m02-scale.html](m02-scale.html) | One fixed ladder and two faces, each with its job; the measure keeps reading comfortable. |
| M03 | [m03-layers.html](m03-layers.html) | Palette → roles → components: the only path colour takes into code; dark mode re-maps roles only. |
| M04 | [m04-ladder.html](m04-ladder.html) | The overlay ladder ranked by attention demanded: modal → sheet → popover → toast. |
| M05 | [m05-states.html](m05-states.html) | The seven states of one control: the mouse journey, the keyboard journey, and the special states. |
| M06 | [m06-budget.html](m06-budget.html) | The response budget of one action: 100ms ack, skeleton vs spinner, exits faster than entrances. |
| M07 | [m07-shelves.html](m07-shelves.html) | The four shelves of state and the questions that sort new state into them. |
| M08 | [m08-map.html](m08-map.html) | One mutation through the written map into exactly the dirty keys — plus SSE and reconnect-resync. |
| M09 | [reload-journey.html](reload-journey.html) | The real VozLab reload journey, source-backed at a pinned commit: SSR → lock → refresh → memory token → me. |
| M10 | [m10-floor.html](m10-floor.html) | The professional floor as gates: tokens → automated → manual → field numbers, looping on regression. |
| M11 | [m11-stance.html](m11-stance.html) | The three stance questions and the school each one answers — with the landing-only warning. |
| M12 | [m12-brief.html](m12-brief.html) | The workshop loop: decisions → spine → rules → numbers → brief → amendments feeding back. |
| M13 | [m13-phone.html](m13-phone.html) | The phone test as definition-of-done, each failure with its named fix and a re-test edge. |
| M14 | [m14-budget.html](m14-budget.html) | Step budget of a task: count decisions → one surface or staged → the reversibility ladder. |
| M15 | [m15-ack.html](m15-ack.html) | The acknowledgment contract: ack <100ms, change at the site of action, apology when it fails. |
| M16 + M18 | [event-loop.html](event-loop.html) | One turn of the event loop with the two freeze paths and the off-thread escape; the frame pipeline it feeds. |
| M17 | [m17-router.html](m17-router.html) | The method router: product question → generative / evaluative / comparative / ethics check. |

Reading tips: start on Live and let one trace complete, then follow a
single lane; the cards hold the module's Decision rules that matter most.
The red/exception lanes are the named failure modes — that is where the
"burdo" feeling lives.

Candidates (JSON) and gate receipts live under `.archify/` (gitignored);
regenerate any page with `node <archify-cli> finalize workflow
.archify/workflow-<slug>-*/candidate.json
docs/frontend-criteria/diagrams/<slug>.html --quality <profile> --json`.
