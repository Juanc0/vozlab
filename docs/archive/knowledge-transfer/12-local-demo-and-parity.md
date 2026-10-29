# 12 — Local operation, the presentation, and the AWS emulator question

You asked for two things here: a way to run the whole system locally at no cost, for a demonstration in a presentation,
and an understanding of emulators such as LocalStack. The first is already largely in place, and this file explains how
to make it safe and reliable for a live audience. The second has changed in 2026, and the change matters for your plan.

## 1. The judgment

- **The laptop is the right stage.** Everything the product does, including the AI pipeline, runs locally with
  `docker compose`, without an AWS account and without paid services. Nothing in the demo needs the internet except
  the first download of models.
- **Make the laptop safe before the talk.** Today the compose file publishes database, cache and model ports on every
  network interface (`09` S-05). On conference Wi-Fi that is a real exposure, and it costs one line to fix.
- **Show the real sign-in flow, not the shortcut.** Add a local Zitadel realm to Compose, so the presenter signs in
  through an identity provider, offline. The development token route is labelled as development-only, which is correct
  for the product but weak as a demonstration of trust.
- **Do not use an AWS emulator to run the product.** It is not needed. It is only useful to test infrastructure code,
  and the free options changed in March 2026.
- **Prepare the contingencies.** A live AI pipeline on a laptop CPU can be slow. Prepare a recorded fallback and a
  pre-seeded state so the talk does not depend on luck.

## 2. What runs locally today

| Service | How | Port | Notes |
| --- | --- | --- | --- |
| PostgreSQL 18 (with AGE and pgvector) | `docker compose up -d postgres` | 5432, all interfaces | Default credentials `postgres/postgres`. AGE should be removed (`05` §13). |
| Redis 7 | compose | 6379, all interfaces, no password | Use a password and loopback binding. |
| Ollama | compose | 11434, all interfaces | Pull the models once; then offline works. |
| Python workers (optional) | `docker compose --profile workers up -d` | none | Need `JWT_SECRET` and the dev identities. |
| API | `pnpm --filter @vozlab/api dev` (on the host) | 3000 | Not containerised yet (ROADMAP 4.6). |
| PWA | `pnpm --filter @vozlab/web dev` (dev server) or `build` then `node` | 5173 | The dev server is for development; prefer the built server on stage. |

**Commands the presenter runs, in order:** `pnpm install`; `cp .env.example .env` (and change the secrets); `set -a; . ./.env; set +a`;
`docker compose up -d --build`; `pnpm --filter @vozlab/database db:migrate`; `db:seed:dev`; `pnpm --filter @vozlab/api dev`;
`pnpm --filter @vozlab/web dev`. The full runbook is `docs/runbook-dev.md`. [repo]

**Time to first run:** about fifteen steps. Measure it on a clean machine before the talk; if it exceeds fifteen minutes
without model downloads, script it.

## 3. Hardening the laptop for a live audience

| Item | Action | Why |
| --- | --- | --- |
| Published ports | Bind to `127.0.0.1` (for example `127.0.0.1:5432:5432`); do not publish Ollama | Conference networks are shared (`09` S-05). |
| Credentials | Change the database password; set a Redis password; generate a fresh `JWT_SECRET` (at least 32 characters) | The example values are public in the repository. |
| Mode | Build the web app and run the built server; keep the dev server for development only | Fewer moving parts and no hot reload during the talk. |
| Dev sign-in | Keep it (development builds only); it is the presenter's maintainer role | Needed to approve seeded proposals (ROADMAP 3.9). |
| Network | Work with the network disabled after the first pull | Proves the local claim and removes a failure mode. Confirm the fonts and assets are vendored (they are: IBM Plex). |
| Logs | Keep `LOG_PRETTY=true` on the presenter's screen only if it helps; otherwise off | Readability versus noise. |
| Machine | Power adapter, the presentation resolution, and a second screen for the presenter's notes | Routine, but it breaks talks. |
| Rehearsal | Full run twice, the day before and the morning of | Catches the stale state and the port conflicts. |

## 4. The emulator question: LocalStack and the alternatives

### 4.1 What changed

LocalStack's Community edition was discontinued as a separate product. From **23 March 2026** the single image requires an
account and an auth token, including in CI. A free plan remains for non-commercial use, and a student plan exists. The
community repository was archived. [web] Read LocalStack's current terms before you rely on any version of it. For a
university demonstration the non-commercial plan may apply; confirm that yourself.

### 4.2 The alternatives, as found in March to October 2026

| Option | Licence and access | What it covers | Caveats | Fit |
| --- | --- | --- | --- | --- |
| **Floci** | MIT; no account or token [web] | Vendor pages report different service counts (from about 20 to 125, depending on the page), including S3, SQS, DynamoDB, RDS (real PostgreSQL in Docker), ElastiCache (real Redis), Cognito and Neptune (real Docker) [web] | Launched March 2026; young project. Vendor benchmarks. Port 4566, compatible endpoints. The counts are not reconciled; verify the services you need. | **Good candidate** for infrastructure tests. Verify the services you need. |
| **Moto** | Apache 2.0; open source | Python library and server mode; wide coverage of the API surface | Mocks behaviour rather than running real engines; no real databases or containers for most services | **Good** for unit-level tests of infrastructure code and for a lightweight server. |
| **MiniStack** | Open source (verify) | Some services backed by real engines (for example PostgreSQL and Redis) [web] | Young project; verify coverage | Candidate. |
| **fakecloud** | Open source (verify) | Around 23 services in one comparison [web] | Young project | Candidate for breadth of API shapes. |
| **Real AWS sandbox account** | Your account; charges apply | Everything | Costs; accidents are expensive | Use with budgets and tags if emulators fall short. |

**Judgment:** the application does not need any of them. Use Moto for fast unit-level checks of infrastructure code, and
Floci for an integration check if you need services that behave more like the real ones. Pin the version of the emulator,
as with any dependency (`10` §6).

### 4.3 What an emulator can and cannot prove

| Question | An emulator can answer it | Only real AWS can answer it |
| --- | --- | --- |
| Does the infrastructure code synthesise and plan? | Yes (with the planning tools, without emulation) | — |
| Does the service start with the environment variables? | Partly | Yes |
| Do the IAM policies allow the access needed? | Partly | Yes (using real policy simulation) |
| Does failover, scaling or throughput behave as expected? | No | Yes, and only in a test environment |
| Does the ALB, CloudFront and WAF configuration serve the right headers and cookies? | Partly | Yes |
| Does Bedrock return the expected embeddings? | No | Yes |

## 5. A demonstration script that does not depend on luck

The script is a suggestion. Each scene states what it shows and what to say about the limits, because an honest limit
builds more trust than a claim that breaks.

| # | Scene | What to show | What to say (and the honest limit) |
| --- | --- | --- | --- |
| 1 | The problem | The Spanish demo graph, three clusters | "This is a seeded demonstration. The seed is labelled as such." |
| 2 | Joining | An event code (the raw code is shown once by the CLI) | "No tenant is visible in the code. Codes expire and can be revoked." |
| 3 | Signing in | Zitadel sign-in (after section 6) | "This is a real sign-in flow; the identity provider is local for the talk." |
| 4 | Exploring | Zoom, walk by clicking, the inspector | "The layout is a physics simulation; it is deterministic for a given input." |
| 5 | Creating | A new node | **Limit:** the node is `PENDING` and stays so. "Acceptance of a new item is not yet in the product; it is the next milestone." (F-01) |
| 6 | Proposing | A correction proposal, then approval as maintainer | Works. Show the diff. |
| 7 | Discussing and voting | A thread, a reply, a vote | Works. |
| 8 | The AI | Create a node, then show the embedding arriving in the logs (seconds). The Relator verdict can take minutes on a laptop CPU | Pre-run it, or show the recording. "The agents propose; people decide." |
| 9 | Offline | Disable the network; the shell still opens | **Limit:** data needs the network. "The product is online-first by design." |
| 10 | Architecture | The ADRs, the decision register (`15`) | "Every decision has a recorded trade-off." |

**Traps to avoid:**

- Do not promise that agent suggestions become accepted content. They cannot yet (F-01).
- Do not create dozens of nodes live; the AI queue on a laptop will lag and the graph will move unpredictably.
- Do not show the Consolidator. It does not exist.
- Do not claim performance numbers you have not measured for the audience's scale. The verified synthetic figures are
  in ADR-0027 and should be quoted as synthetic.

## 6. Adding a local Zitadel realm (recommended)

The environment file already points at a Zitadel realm layout (`http://localhost:8081`), and the API
verifies the ID token against that issuer. A Zitadel service in Compose, with a realm imported on start, gives the
presenter the real flow: authorisation code with PKCE, redirect, refresh rotation and logout. It does not change the
product code. It does require:

1. A Zitadel service in `docker-compose.yml` (pin the image tag), with a realm JSON that defines the client
   `vozlab-api` with the redirect URI from `.env.example`, two or three demo users and the `tid` claim mapped to the
   tenant key `sabana`.
2. The identity provider issuer and JWKS values pointing at the local realm (already in `.env.example`).
3. A short test in the integration suite that signs in through the local realm.

Zitadel is open source (verify the licence and version you pin). The work is about one to two days [juicio]. It also
serves as the local stand-in for an institutional IdP in development, which is valuable beyond the demo (`08` §6).

## 7. Presenter's checklist (the morning of)

- [ ] Machine on power; notifications off; a second screen or a printed copy of the script.
- [ ] Pull request and branch state known; no uncommitted changes in the demo path.
- [ ] `.env` with fresh secrets; ports bound to loopback (`docker compose ps` shows `127.0.0.1`).
- [ ] `docker compose up -d`; `db:migrate`; `db:seed:dev` (the seed is idempotent); API health returns `ready`.
- [ ] Models pulled and loaded (`ollama list`); the embedding of a test node completes.
- [ ] Web built; the built server serves on the expected port; the browser cache cleared once.
- [ ] Sign-in works (Zitadel or dev sign-in); the presenter can approve a seeded proposal.
- [ ] Network disabled and the demo runs; then re-enabled for the questions.
- [ ] Recorded fallback for scenes 8 and 9 on the desktop; screenshots of scenes 4 and 6.
- [ ] Mobile layout checked at 375 px if the audience may ask (the layout is mobile-first).
- [ ] After the talk: stop the stack; do not leave the laptop serving anything.

## 8. Costs and licences of the local stack (judgment; verify)

| Item | Cost | Check before relying on it |
| --- | --- | --- |
| Docker | Docker Desktop has licensing terms that depend on the size and type of organisation. Alternatives such as Podman or Colima are free to use. [juicio] | Confirm your institution's status or use Podman or Colima. |
| PostgreSQL, Redis (or Valkey), pgvector, Zitadel | Open source | Pin versions. |
| Ollama | Free runtime | Check each model's licence before the talk: some open models carry usage restrictions. |
| Models | Open weights | Llama-family and Gemma-family licences differ from Apache 2.0 (`06` §4). |
| Emulators | Varies (section 4) | Read the current terms. |
| Electricity and hardware | Your own | — |

## 9. Parity: what the local stack must keep equal to production

The rule is that **a local behaviour that production cannot have is a defect**, not a convenience. Keep these equal:

- The environment variable names (the same set, loaded from a file locally and from Secrets Manager in production).
- The Redis-compatible engine: Valkey locally and in ElastiCache (`11` §4.4).
- The database extensions: pgvector locally and in RDS; AGE removed from both (`05` §13).
- The identity contract: the same issuer and claim mapping, with Zitadel standing in for the institutional provider.
- The model contract: the same HTTP interface for Ollama, and the same embedding dimension and model identifier.
- The transport: HTTPS in production; on the laptop, document the difference and test cookies in staging.

The gaps that will remain (no load balancer, no CDN, no WAF locally) are acceptable because they are tested in staging.

## 10. Sequence of work to make the demo robust

1. Bind ports to loopback and change the secrets (today, about an hour).
2. Remove AGE from the local image (one to two hours plus a rebuild).
3. Add Valkey and a password to Redis in Compose (one hour).
4. Add Zitadel with a realm (one to two days).
5. Build an end-to-end smoke script that runs scenes 2, 3, 5 and 6 against the local stack and fails loudly (half a day).
6. Record the fallbacks and write the script (half a day).
