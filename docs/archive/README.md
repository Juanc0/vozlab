# Archive (frozen)

This directory preserves the project's paper trail. **Nothing here is
maintained.** When the archive disagrees with the code or with the live docs, the
code wins.

| Path | What it is |
| --- | --- |
| `spec-v1/` | The approved v1 specification tree (`00_ARCHITECTURE_OVERVIEW`, `system/`, `modules/`, `devops/`). Superseded by the live docs one level up. |
| `tasks/` | The 45 self-contained task prompts of Phases 1R/1S/1T, plus their executor README. |
| `reviews/` | Phase review reports (`phase-1r`, `phase-1s`, `phase-1t` close-out). |
| `history/` | The old `EXECUTION_PLAN.md` and `TODO.md` (phase 0 → 1T). |
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
