# VozLab — Knowledge Transfer Pack

**Snapshot date:** 2026-10-23 · **Repository state:** `main` @ `1e8747c` (151 commits; no tracked file changed by this review)
**Audience:** the product owner and anyone who must take over, present, fund or operate VozLab.
**Status of this pack:** analysis and recommendations. It decides nothing by itself. Decisions are
recorded as ADRs under `docs/decisions/` once you choose an option (see `15-decision-register-and-roadmap.md`).

This folder is independent of the live documentation under `docs/` and `ROADMAP.md`. It does not
replace them. Where this pack and the code disagree, **the code wins**, as in the repository's own rules.

---

## How to read it

Pick the path that matches your role. Every file is self-contained, but the order below minimises rereading.

| If you are… | Read, in order |
| --- | --- |
| Deciding what to do next | `01` → `15` → `09` |
| Presenting or demoing | `01` → `12` → `03` (sections 3 and 6) |
| Planning hosting and cost | `11` → `05` → `10` → `15` |
| Owning the AI pipeline | `06` → `07` → `13` |
| Owning identity and tenants | `08` → `05` → `09` |
| Joining as an engineer | `04` → `03` → `02` → `14` |

## Files

| # | File | What it answers |
| --- | --- | --- |
| 00 | `00-README.md` | What this pack is, how to use it, evidence legend. |
| 01 | `01-executive-summary.md` | The verdict, the blocking findings, short answers to each of your concerns. |
| 02 | `02-background-and-decisions.md` | How we got here: timeline, the decisions that shaped the system, what was rejected and why. |
| 03 | `03-current-state.md` | Inventory of assets, verified test and build results, maturity by component, documentation drift. |
| 04 | `04-how-it-works.md` | Architecture in motion: request path, auth, events, workers, frontend, failure modes, responsibilities. |
| 05 | `05-data-and-database.md` | Two-database topology, schema, indexes, migrations, tenant fleet operations, backups, pgvector. |
| 06 | `06-ai-agents.md` | The agents: workflows, data flows, identities, models and their limits, evaluation gap, options. |
| 07 | `07-graph-and-ontology.md` | Graph database options compared, ontology governance gaps, how the ontology can grow from community input. |
| 08 | `08-identity-tenancy-and-guests.md` | Who a user is across tenants and workspaces, guest-access options compared, recommendation. |
| 09 | `09-security-review.md` | Security findings with severity, evidence and fixes; what is already sound. |
| 10 | `10-dependencies-and-lifecycle.md` | Installed versus latest, end-of-life dates, upgrade order. |
| 11 | `11-aws-scalability-and-hosting.md` | Target AWS architecture, service choices with alternatives, scaling model, blockers before deployment. |
| 12 | `12-local-demo-and-parity.md` | Running everything locally at no cost, the LocalStack change, emulator alternatives, presentation plan. |
| 13 | `13-internationalization.md` | Interface, content, ontology, models and PII across languages; options and phased recommendation. |
| 14 | `14-process-communication-quality.md` | Team, governance, CI and quality gates, documentation governance, communication channels. |
| 15 | `15-decision-register-and-roadmap.md` | Every open decision with options and a recommendation, the Now/Next/Later plan, and the questions for you. |
| 16 | `16-sources-and-verification.md` | Every external source used, the commands run, and the limits of this analysis. |

## Evidence legend

Every substantive claim is tagged so you can judge how much weight it deserves.

| Tag | Meaning |
| --- | --- |
| **[repo]** | Read directly in the repository: code, schema, config or documentation. The path is given where useful. |
| **[run]** | Produced by a command executed on 2026-10-23 (test counts, lint, type-check). |
| **[web]** | Taken from an external source found on 2026-10-23. Sources are listed in `16`. Vendor claims are flagged as such. |
| **[juicio]** | My professional judgment, built on the evidence above it. It can be wrong; argue with it. |
| **[supuesto]** | An assumption I could not verify. It needs your confirmation before it drives a decision. |

## Scope and limits

- Covered: architecture, data, AI, graph, identity, security, dependencies, hosting, local operation,
  internationalisation, process and communication.
- Not covered: a live penetration test, a load test (none exists in the repo), a cost quote from AWS,
  interviews with institutional stakeholders, and any production data (none exists yet).
- No tracked file was changed. The only new, untracked content is this folder. The test and build commands
  regenerated ignored caches and build outputs (`.turbo`, `.svelte-kit`, `build`, `.pytest_cache`), as they always do.
- Where I ran the test suites, I report what they printed. Where I read a figure from a document, I say so.
