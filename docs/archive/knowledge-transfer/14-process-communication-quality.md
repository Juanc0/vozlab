# 14 — Process, communication and quality

This file covers how the work is organised, which quality gates exist and which do not, how documentation is governed,
how the team uses AI agents, how the project communicates, and what is missing before an institution can rely on it.

## 1. The judgment

- **The discipline is unusually good for the size of the team.** Decisions are recorded before code (ADRs), the board is
  a single file with a clear rule, reviews are written and archived, the team corrects its premises in writing, and the
  clarification protocol forbids guessing. These are habits that most teams take years to build. [repo]
- **The team is one person.** All 151 commits share one author, and there are no merge commits, so no pull request was
  reviewed by anyone else. The reviews are performed by agents configured in the repository, which are useful but are not
  an independent human check. This is the largest process risk. [repo][juicio]
- **The quality gates cover the code and not the system.** Build, type-check and unit tests gate every push. Nothing gates
  the database against real PostgreSQL, the browser journeys, the security posture, the container images, or the
  performance targets. [repo]
- **The documents drift from the code and from each other.** The numbers differ across four documents, and some status
  statements are out of date. The fix is mechanical and should be automated. [run]
- **Operations, incidents and compliance have no process yet.** That is normal before deployment, and it is the next
  process to build. The institution will ask for it.

## 2. How the work is organised today

| Element | What exists | Assessment |
| --- | --- | --- |
| Board | `ROADMAP.md`: 82 items done, 8 open; phases with checkboxes; each item carries a one-line result | Excellent for a single owner. Two weaknesses: phase statements in the "current state" section are dated (2026-10-19), and the roadmap has no items for operations, governance gaps or identity (F-01, F-02, F-17 are not on it). [repo] |
| Rule for a task | "One checkbox = one PR-sized batch that leaves the build green" | A good rule. Not enforced by a pull request, because all commits go to `main`. |
| Decisions | 27 ADRs in a consistent format, with status, context, alternatives and consequences | Excellent. One thing to check: that every superseded ADR points forward to its successor (ADR-0018 supersedes ADR-0014; confirm the link from the older record). The index is maintained by hand. [repo] |
| Specs | `docs/spec/*.md` for the workers and the PWA, with "open questions" sections | Good. The Consolidator spec is open in four places. |
| Archive | `docs/archive/` with 67 frozen files | Good discipline. It keeps history without polluting the live set. |
| Commit style | Conventional prefixes (`feat`, `fix`, `docs`, `chore`); 81 of 151 commits use them, the earlier ones do not | Consistent since October. Keep it. [repo] |
| Branches | One branch, `main` | Acceptable for one person; not for a team. |
| Pull requests | None (no merge commits) | The largest gap for a team. |
| Issues | Not evidenced in the repository | Confirm where issues live (outside git, or not used). [supuesto] |

## 3. Roles and responsibilities

The working agreement (`CLAUDE.md`, `AGENTS.md`) asks the assistant to act as a committee with four roles: Chief Software
Architect, Principal Full-Stack Engineer, Principal Database and AI Engineer, and Staff QA and Security Engineer. The
repository mirrors those roles as six subagents (architect, backend-ts, backend-python, frontend-svelte, qa-security,
reviewer). [repo]

That is a useful way to structure a review. It does not replace the independent judgement of a person, because the same
person configures the roles, reads their outputs and merges the work. Two steps would restore independence without adding
much ceremony:

1. A **second human** reviews every change to authentication, authorisation, tenancy, data retention and the AI write paths.
   That is a small, named set of paths, and it can be enforced with code ownership rules.
2. The **security reviewer agent** runs on every such change, and its findings are recorded in the pull request and closed
   or accepted by a person.

## 4. Quality gates: what runs and what does not

| Gate | Where | Runs in CI | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Install with frozen lockfile | CI | Yes | `pnpm install --frozen-lockfile` | Good. |
| Build and type-check, all TypeScript packages | CI | Yes | Seven tasks green [run] | Good. |
| Unit tests, TypeScript | CI | Yes | 195 API tests; 515 web tests [run] | Good. |
| Unit tests, Python | CI | Yes | 105 tests [run] | Good. |
| Python lint and format | CI | Partly | CI checks three of four packages: the Extractor is missing from the `ruff check` and `ruff format` lines [repo] | Add the Extractor. |
| TypeScript lint | Local only | No | 24 errors, 7 warnings [run] | Red; not gated. Fix or move to the new toolchain (`10` Wave 4). |
| Integration tests against PostgreSQL and Redis | Local, opt-in | **No** | No database service in the workflow [repo] | **Repository SQL is not exercised in CI.** The highest-value gap. |
| Migrations on an empty database | None | No | — | Add to the integration job. |
| End-to-end browser tests | Local, opt-in | **No** | Playwright suite exists [repo] | Add a job with the API and web app started against a seeded database. |
| Contract tests between workers and the API | None | No | The specification lists a `contract` job as planned [repo] | Add schema fixtures for the three payloads the workers send and receive. |
| Coverage thresholds | None | No | `turbo.json` has `outputs: []` [repo] | Set thresholds for domain and application layers (the specification proposes 85%). |
| Dependency vulnerability audit | None | No | — | `pnpm audit` and `pip-audit`, failing on high severity. |
| Container image scan and SBOM | None | No | Images are built, not scanned | Add before any deployment. |
| Secrets scan | None | No | — | Add a pre-commit or CI secret scanner; it would have caught F-06. |
| Load test | None | No | k6 skill exists; no scripts in repository [repo] | Nightly against a seeded tenant, with the NFR thresholds. |
| Architecture rules (layering) | None | No | Conventions are written; no tool enforces them [repo] | Add a dependency-boundary rule so that `domain/` cannot import infrastructure. |

**The most valuable single addition** is a CI job with a PostgreSQL 18 service (with pgvector), a Redis service, the router
and tenant migrations, the seed, and the integration suite. It turns a set of tests that people must remember to run into a
gate, and it exercises the SQL that the unit tests can only mock.

## 5. Documentation governance

### 5.1 The drift, measured

The test counts differ across four documents, and the code agrees with none of them (`03` §4). Other statements are out of
date: the README's introduction calls the PWA "just started" while its table says Phase 3 is complete; the README calls the
embedder "not in Compose/CI yet" while Compose defines it and CI builds its image; the lint error count is 26 in one place,
24 in another, and 24 errors plus 7 warnings in the measurement.

### 5.2 Why it happens

Documents are written by hand, at speed, in several places, and nothing compares them with the code. The first week of the
project produced documents with generation tools and reviews by other models (`02` §2). The habit has survived, and the
numbers are the first thing to rot.

### 5.3 The fix (cheap and effective)

| Rule | Mechanism |
| --- | --- |
| Numbers in documents come from a command | A script that prints test counts, lint counts, route counts and ADR counts; documents include the output or a generated block. |
| Every status carries a date and the command that produced it | A convention in the header of each status section. |
| A single source of truth for the status | `ROADMAP.md` for work; `docs/README.md` for requirement status; the others link to them instead of repeating numbers. |
| Links are checked | A link checker in CI for the Markdown tree. |
| Superseded decisions point forward | An ADR that supersedes another updates the older ADR's header. Some already do; make it consistent. |
| A drift check on release | Before a demonstration or a release, run the script and fix the documents. |

Time to implement: about one day for the script and the convention; a half-day for the link checker.

## 6. Testing practice

**Strengths.** The unit suites are substantial and green. The graph work measured frame times, DOM counts and overlaps before
choosing an approach, and the ADR-0027 work measured query plans with synthetic data. That habit is rare and valuable.

**Weaknesses.**

- No test runs the SQL against PostgreSQL in CI (section 4).
- No test checks recall of the vector search on a multi-workspace dataset (F-04, `05` §4).
- No test covers the Relator's behaviour on adversarial or long input (`06` §5, §7).
- No property-based tests for the masker, which is exactly the kind of code where generated inputs find what examples miss.
- The Playwright suite is opt-in and was described with inconsistent counts (10, 14, 18 and "3/3" in different places).
- No test checks that the production bundle excludes the development sign-in and the development-only surfaces (the claim is
  in the roadmap; a bundle-content test would make it permanent).

## 7. Communication

### 7.1 Who needs to know what

| Stakeholder | What they need | How, today | How, recommended |
| --- | --- | --- | --- |
| You, as product owner | Status, risks, decisions to take | This pack, the roadmap, the chat | A fortnightly one-page status from the script in §5.3, plus the decision register (`15`) |
| The presenter (possibly you) | A stable demo, a script, known limits | The runbook and the seed report | The checklist in `12` §7 |
| Institutional sponsors (to be identified) | Value, timeline, cost, data protection | Not yet engaged in the repository | A short brief per milestone: what works, what does not, what it costs, what they must decide |
| Institutional IT and security (future) | Architecture, data flows, identity, hosting, incident handling | Documents in the repository | A security pack: architecture, data inventory, data flows, threat model, controls, residual risks |
| Data protection officer (future) | Legal basis, retention, transfers, rights | Not yet | A records-of-processing entry and an impact assessment per source (`09` §5) |
| Moderators and community (future) | How to propose, vote, contest, and what the agents do | Not yet | An AI-use statement and a participation guide (`06` §12) |
| Engineers joining (future) | How to run, change and operate | The runbooks and the ADRs | An onboarding path (`00-README` reading paths) and the runbooks |

### 7.2 Channels

Today: git, the roadmap, the docs and the agent sessions. Those are the right channels for one person and are not visible to
anyone else. Recommended channels, in order of importance:

1. A **status page** for stakeholders, generated, not typed (§5.3).
2. **Decision notifications**: when an ADR is accepted, the affected people hear about it in the channel they use.
3. **Release notes** per tagged version, short and factual.
4. **Incident notes** for every production event, blameless, with the timeline and the action items.

## 8. Operations: what must exist before the first institution uses the platform

Nothing below exists today. Each item is a document or a small procedure, and most are a half-day to write.

| Process | Minimum content | Owner |
| --- | --- | --- |
| Incident response | Severity levels; who is paged; the first fifteen minutes; how to communicate with the institution; the post-incident template | Engineer on duty |
| On-call | A rota (even if it is one person and a named backup); the alert routes | Engineering lead |
| Change management | How a change is approved for production; freeze windows around events and demonstrations; rollback procedure | Product owner and engineer |
| Backup and restore drill | Schedule; the restore steps per tenant (`05` §8); the measured time | Engineer |
| Access management | Who holds production credentials; how they are granted, reviewed and removed; the audit of access | Product owner |
| Vulnerability management | How advisories are triaged; timelines by severity; who decides on acceptance (`10` §6) | Engineer |
| Data subject requests | Intake, verification, response times, what can and cannot be erased (`05` §9) | Data steward |
| Breach response | Assessment, notification duties and timelines under the applicable law, contacts | Data protection officer |
| Supplier review | A short review of each external processor (cloud, model host, identity provider, email) | Product owner |
| Records of processing and impact assessment | One entry per data source and one for the AI pipeline (`09` §5) | Data steward |

**Jurisdiction.** The author's commit metadata and the development tenant name suggest a Colombian institutional context
[supuesto]. If so, the relevant framework is likely to include Ley 1581 de 2012 on personal data protection and its decrees,
with the national data protection authority as supervisor. Confirm with counsel. The obligations above are needed in any
jurisdiction, but the wording and the timelines depend on the law.

## 9. The agent-assisted way of working

### 9.1 What exists

- Six subagents with defined scopes (architect, backend-ts, backend-python, frontend-svelte, qa-security, reviewer) in
  `.opencode/agents/`.
- Two commands: `next-task` (take the next roadmap item, implement it, validate, mark it) and `review-arch` (audit the code
  against the docs and the roadmap) in `.opencode/commands/`.
- Operating rules in `AGENTS.md` and `CLAUDE.md`, including the clarification protocol.
- 56 skill folders under `.agents/skills/`, tracked by a lock file, and duplicated copies under `.claude/`, `.continue/` and
  `.qwen/` for some of them. [repo]
- An MCP configuration for PostgreSQL (read-only role), Playwright, GitHub and an optional browser devtools server.

### 9.2 Benefits

Consistency across a large codebase; fast first drafts; a disciplined habit of writing tasks and reviews; and a reviewer
that reads every change with the same checklist. These are real and should be kept.

### 9.3 Risks

| Risk | Example in this repository | Control |
| --- | --- | --- |
| Credentials in configuration | `opencode.json` contains a database password (F-06) | Secret scanning; references to environment variables only |
| Unreviewed generated code in sensitive paths | Authorisation and tenancy code can be changed by an agent in one session | Human review of those paths (section 3) |
| Document drift | Counts and statuses are typed by hand (section 5) | Generated numbers |
| Over-large skill catalogue | 56 skills plus copies; some for technologies the project does not use (for example, iOS design) | Curate to what the project uses; keep one canonical copy |
| Scope creep | A graph canvas consumed most of one week while governance was not on the board (`02` §6) | The roadmap must show the product-critical items at the top, and an explicit rule that governance items take precedence |
| Dependence on a tool version | Agent behaviour changes with tool versions | Pin tool versions in the repository where possible |

### 9.4 Rules to keep the benefit and remove the risk

1. Commits produced with agent help say so in a trailer, so that the review knows where to look.
2. Changes to authentication, authorisation, tenancy, data retention and AI write paths require a human reviewer.
3. No secret ever appears in a tracked file, including agent configuration.
4. The security reviewer agent's findings are recorded; accepted risks are written down with the reason.
5. The skill catalogue is reduced to what the project uses; duplicates are generated, not copied.

## 10. A minimal, sufficient process for a team of two or three

**Definition of done** (a checklist in the pull request template):

- [ ] Build, type-check and tests green locally and in CI.
- [ ] Integration tests for any change to SQL, migrations or auth.
- [ ] A roadmap item ticked with a one-line result, and the status matrix updated if a requirement changed.
- [ ] An ADR if the change alters a contract, a security property, a data model or a dependency's major version.
- [ ] Human review for the sensitive paths in section 3; security checklist for those paths.
- [ ] Migration notes for any schema change, including how to apply it to every tenant database.
- [ ] Documentation that quotes a number has the number generated.
- [ ] Demonstration impact noted if the change affects the demo script (`12` §5).

**Branching:** short-lived branches; pull request to `main`; squash or rebase merge; required status checks; at least one
approval, from a second person for the sensitive paths.

**Release:** tagged versions; release notes; the migration runbook attached; a rollback note; a demonstration freeze if an
event is scheduled.

## 11. Metrics worth tracking once a deployment exists

| Metric | Why | Early target (judgment) |
| --- | --- | --- |
| Lead time from merge to production | Speed of learning | Under one day |
| Deployment frequency | Health of the pipeline | Weekly at least |
| Change failure rate | Quality of changes | Under 15% |
| Time to restore after an incident | Operational readiness | Under one hour for the pilot |
| Share of changes with a human review on sensitive paths | Governance | 100% |
| Open security findings by age | Risk | None above 30 days at high severity |
| Documentation drift check failures | Honesty of the record | Zero at release |

## 12. The next process steps, in order

1. Add a PostgreSQL and Redis job to CI with the integration suite (section 4). **Highest value.**
2. Introduce branches and pull requests, with the sensitive-path review rule (section 3).
3. Add the secret scanner and the dependency audit to CI (`09` S-02, S-12).
4. Generate the numbers in the documents and add the link checker (section 5).
5. Write the incident, backup-restore and change-management procedures (section 8). One day each.
6. Add a second person to the review rota, even part-time, and run a restore drill together.
7. Put the governance gaps (F-01, F-02, F-17) on the roadmap at the top, with their acceptance criteria (`15`).
