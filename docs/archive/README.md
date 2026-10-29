# Archive (frozen)

This directory preserves the project's paper trail. **Nothing here is
maintained.** When the archive disagrees with the code or with the live docs, the
code wins.

| Path | What it is |
| --- | --- |
| `spec-v1/` | The approved v1 specification tree (`00_ARCHITECTURE_OVERVIEW`, `system/`, `modules/`, `devops/`). Superseded by the live docs one level up. |
| `tasks/` | All finished task prompts: Phases 1R/1S/1T (45) + `auth-onboarding-v5/` + `auth-onboarding-v6/` (archived 2026-10-29 once the committee review recorded their evidence in the living docs/ADRs). |
| `notes/` | Point-in-time execution notes of the v5/v6 batches (archived 2026-10-29; their remaining slivers were promoted to ROADMAP first). |
| `knowledge-transfer/` | The frozen 2026-10-23 deep-audit pack. The six files with still-unique content were promoted to [../knowledge/](../knowledge/README.md) on 2026-10-29; the rest lives here as history. |
| `guia-identidad-ia/` | The atomic-task guide for the identity intervention (A/B/C/D/F) and the AI-worker guide. The login blocks shipped (see the committee record); the AI half (block E, A4/A5, F2 and `01-explicacion` §12) remains the normative spec for the unbuilt Extractor work, referenced from [../knowledge/ai-pipeline-and-models.md](../knowledge/ai-pipeline-and-models.md). |
| `research/` | Frozen decision-support research (identity-broker comparison, authentik-vs-zitadel) — superseded by ADR-0030 as decision, kept as the paper trail. |
| `reviews/` | Phase review reports (`phase-1r`, `phase-1s`, `phase-1t` close-out). |
| `history/` | The old `EXECUTION_PLAN.md` and `TODO.md` (phase 0 → 1T), and `runbook-deploy-cloudflare-tunnel.md` (ADR-0039 exposure model, superseded by ADR-0040/0043; its Floci § was promoted to [../ops/floci-terraform.md](../ops/floci-terraform.md)). |
| `prompts/` | One-shot prompts used to generate the original spec and plan. |

Known stale facts in `spec-v1/` (do **not** trust): PostgreSQL 16, drizzle-orm
0.34 / drizzle-kit 0.25, HTTP-only cookie sessions, salted `author_hash`
(`AUTHOR_HASH_SALT`), `tx?: any` transaction ports, "routes not wired yet", and
Phase-1 milestones written before the Phase-1R/1S/1T corrections.

Current sources of truth:

- Code and configuration.
- [docs/README.md](../README.md) — index + requirement status matrix.
- [docs/requirements.md](../requirements.md) — normative FR/NFR.
- [docs/decisions/](../decisions/) — ADRs.
- [ROADMAP.md](../../ROADMAP.md) — open work.
