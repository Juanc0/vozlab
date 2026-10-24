# 16 — Sources, commands and the limits of this analysis

This file makes the pack auditable. It lists the commands that produced the measured facts, the external sources
used (with their quality), the claims that rest on judgment or on my general knowledge rather than on a source, and
what was **not** done.

## 1. Commands run on 2026-10-23

All commands ran in the repository root `/home/juan/repos/vozlab` on the branch `main` at commit `1e8747c`.

| Purpose | Command | Result |
| --- | --- | --- |
| Commit count and history | `git rev-list --count HEAD`; `git log --reverse --format=...` | 151 commits, 2026-10-09 to 2026-10-23 |
| Authorship | `git log --format='%an' \| sort \| uniq -c` | One author for all 151 commits |
| Branches and merges | `git branch -a`; `git log --merges --oneline \| wc -l` | Only `main`; zero merge commits |
| Last commit | `git show --stat HEAD` | Removed `GraphCanvas.svelte`, `graph/cytoscape.ts` and related tests (roadmap 3.64) |
| Credential history | `git log -p --all -S 'vozlab_mcp_local' -- opencode.json` | Present in commit `a98dcc0` |
| Build and type-check | `pnpm turbo run build type-check` | 7 of 7 tasks successful |
| API tests | `pnpm --filter @vozlab/api test` | 35 files, 195 tests passed |
| Web tests | `pnpm --filter @vozlab/web test` | 60 files, 515 tests passed |
| Python tests | `uv run pytest -q` | 105 passed |
| Python lint | `uv run ruff check` on the four Python packages | All checks passed |
| API type-check | `pnpm --filter @vozlab/api exec tsc --noEmit -p tsconfig.json` | Passed |
| Repository lint | `pnpm lint` | 24 errors, 7 warnings |
| Installed versions | `node -p "require('<pkg>/package.json').version"` in `apps/api` and `apps/web` | As listed in `10` |
| Latest versions | `npm view <pkg> version` and `npm view <pkg> dist-tags` | As listed in `10` |
| Python lock versions | `grep -A1 '^name = "<pkg>"' uv.lock` | As listed in `10` |
| Route inventory | `grep -rhoE "app\.(get\|post\|put\|patch\|delete)\('[^']+'" apps/api/src/infrastructure/http/routes.ts` | 33 single-line registrations; auth and embedding routes registered elsewhere |
| Table and index inventory | `grep` and `cat` over `packages/database` schema and migrations | 14 tenant tables, 3 router tables; 28 index statements across tenant migrations |
| Transitions | Read `apps/api/src/domain/entities/Node.ts`; `grep -rn "changeStatus"` | Node transitions as in `04` §5; `changeStatus` only for merges and internal entity logic |
| Identity config | `grep -rn "OIDC_ISSUER\|tid\|hd" apps/api/src` | One issuer; `tid ?? hd` tenant key |
| Vector query | Read `DrizzleNodeRepository.findNearestInWorkspace` (lines 378–452); `grep -rn "hnsw\|ef_search\|iterative"` | HNSW index; no iterative scan setting |
| Browser HTML injection | `grep -rn "{@html" apps/web/src` | No matches |
| Proxy trust | `grep -rn "trustProxy" apps/api/src` | No matches; `Fastify({...})` without it |
| Dead code | `grep -rln "cytoscape" apps/web/src`; `grep -rn "ExplorationCanvas"` | Cytoscape files present; `ExplorationCanvas` imported by nothing |
| Locale on content | `grep -rn -i "locale\|lang"` over the schema files | No language field on content tables |
| Sorting | `grep -rn "localeCompare"` in `apps/web/src` | Several calls without an explicit locale |
| Seed statuses | `grep -n "'ACTIVE'" packages/database/scripts/*.ts` | The seed writes `ACTIVE` nodes directly |
| CI configuration | Read `.github/workflows/ci.yml`; `grep -n permissions` | No services block; no `permissions` key |
| Runtime | `node -v`; `pnpm -v` | Node v24.22.0; pnpm 12.11.2 |
| Logger redaction | Read `apps/api/src/shared/logger/index.ts` | Redacts headers, body fields and `token`/`secret` keys; not query parameters |
| PostgreSQL support | `webfetch https://www.postgresql.org/support/versioning/` | PostgreSQL 18 current minor 18.6, final release 14 November 2030; PostgreSQL 19 RC1 announced 15 October 2026 |

**Not run:** Playwright end-to-end suite; the opt-in integration suite (needs a local PostgreSQL and Redis); `docker compose up`;
the model evaluations (no models were pulled or run); `pnpm audit` and `pip-audit`; load tests; any AWS API call.

## 2. External sources

Sources are grouped by how they were used. Quality is my assessment: **P** = primary (vendor or standards body documentation,
or the project's own repository), **S** = secondary (reputable summary or comparison), **V** = vendor marketing or a
competitor's comparison, read with its bias in mind.

### 2.1 Lifecycle and runtime

| Source | Quality | Used for |
| --- | --- | --- |
| https://fastify.dev/docs/latest/Reference/LTS (Fastify LTS schedule, latest page) | P | Fastify 4 LTS ended 30 June 2025; Fastify 5 supported |
| https://fastify.dev/docs/v4.29.x/Reference/LTS (Fastify 4.29 LTS page) | P | Confirms the v4 end date |
| https://fastify.dev/docs/latest/Guides/Migration-Guide-V5 (Fastify v5 migration guide) | P | Node 20 minimum; schema requirements; removed APIs |
| https://tuxcare.com/blog/fastify-eol and https://eolrisk.com/fastify | S | Summary of end-of-life status; version table |
| https://endoflife.date/nodejs | S (widely used reference) | Node 22 maintenance to 30 April 2027; Node 24 Active LTS to 30 April 2028 |
| https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule | P | Node 26 LTS timing; the new schedule from Node 27 |
| https://www.postgresql.org/support/versioning/ | P | PostgreSQL 18 support to 14 November 2030; current minor 18.6; PostgreSQL 19 RC1 |
| https://www.herodevs.com/blog-posts/node-js-end-of-life-dates-you-should-be-aware-of | S | Cross-check of Node dates |

### 2.2 Database, vectors and graph

| Source | Quality | Used for |
| --- | --- | --- |
| https://github.com/pgvector/pgvector | P | Iterative index scans (0.8.0+), `hnsw.ef_search` default 40, filtering behaviour |
| https://www.postgresql.org/about/news/pgvector-080-released-2952 | P | pgvector 0.8.0 release notes |
| https://www.crunchydata.com/blog/hybrid-vector-search | S | Explanation of filtered HNSW and the relaxed and strict modes |
| https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql | P (vendor blog) | Aurora behaviour with pgvector 0.8.0 |
| https://github.com/apache/age/issues/998 | P (project tracker) | Apache AGE is not supported directly on Amazon RDS |
| https://gdb-engines.com/db/kuzu | S | Kùzu archived; MIT licence; forks |
| https://www.macrumors.com/2026/02/11/apple-acquires-new-database-app and https://cs.uwaterloo.ca/news/... (Waterloo news, 24 February 2026) | S | Acquisition of Kùzu by Apple; the archive date from the repository |
| https://neo4j.com/pricing | P (vendor pricing page) | AuraDB Professional from US$0.09 per GB-hour; Business Critical from US$0.20 |
| https://docs.aws.amazon.com/neptune/latest/userguide/migration-architectural-differences.html | P | Neptune architecture; scaling |
| https://www.usage.ai/blogs/aws/database-savings-plans/neptune-pricing | S (third-party pricing summary) | Neptune per-NCU rate in US East; rates checked 15 October 2026 |
| https://www.tigergraph.com/blog/best-graph-databases; https://flur.ee/blog/neo4j-alternatives | V (vendor comparisons) | Market overview only; not relied on for facts |
| https://www.puppygraph.com/blog/aws-neptune-vs-neo4j; https://www.falkordb.com/comparison/... | V (competitor comparisons) | Qualitative claims (for example, Neptune serverless does not scale to zero); to be verified |

### 2.3 Cache and streams

| Source | Quality | Used for |
| --- | --- | --- |
| https://redis.io/blog/what-is-valkey | P (vendor) | Redis 8 licence options; Valkey BSD-3 |
| https://aws.amazon.com/elasticache/redis | P (AWS) | Valkey as a fully open-source option; Redis OSS 7.2 as the last BSD release |
| https://www.dragonflydb.io/guides/redis-vs-elasticache-key-differences-and-how-to-choose | S | ElastiCache supports Valkey and Redis up to 7.2 for legacy versions |
| https://redisson.pro/blog/valkey-vs-redis-comparision.html | S | Valkey 9.1 and Redis 8.8 release status as of mid-2026 |

### 2.4 AWS hosting and models

| Source | Quality | Used for |
| --- | --- | --- |
| https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html and https://aws.amazon.com/apprunner | P | App Runner no longer open to new customers from 30 April 2026; ECS Express Mode recommended |
| https://encore.dev/articles/end-of-app-runner | S | Context of the App Runner change |
| https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html | P | Titan Text Embeddings V2: 8 192 tokens; 1 024 dimensions; English-optimised with multilingual support; cross-language weakness |
| https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-titan-text-embeddings-v2.html | P | Regional availability, including São Paulo and several EU regions |
| https://qualixsolutions.com/insights/best-aws-bedrock-embedding-models | S | Cohere Embed Multilingual as a safer starting point for cross-language use |
| https://ollama.com/search?c=embedding | P (project library) | Models available for Ollama: `nomic-embed-text`, `nomic-embed-text-v2-moe`, `bge-m3`, `qwen3-embedding`, `embeddinggemma` |
| https://www.morphllm.com/ollama-embedding-models | S | Context defaults in Ollama; task prefixes; benchmark families |
| https://localaimaster.com/blog/best-ollama-embedding-models | S | Practical recommendations for multilingual use |
| https://www.premai.io/blog/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting | S | Licences and dimensions of several embedding models |
| https://atomic.chat/blog/guides/best-embedding-models-for-rag | S | Parameters, dimensions, context limits and licences |
| https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models | S | Multilingual positioning of Qwen3-Embedding and BGE-M3 |
| https://milvus.io/blog/choose-embedding-model-rag-2026.md; https://surrealdb.com/blog/embedding-models-comparison | S and V | Cross-checks; the second is a vendor comparison |
| https://www.promptquorum.com/local-llms/local-llm-model-updates-2026; https://geotoolbox.ai/blog/best-open-source-llms; https://localaimaster.com/blog/small-language-models-guide-2026; https://benchlm.ai/best/open-source; https://hidekazu-konishi.com/entry/open_weights_llm_release_history_and_timeline.html | S (mixed quality) | Current open chat models, sizes and licence families. Treat as leads; verify each model's licence and benchmark locally |

### 2.5 Identity and internationalisation

| Source | Quality | Used for |
| --- | --- | --- |
| https://learn.microsoft.com/en-us/entra/external-id/what-is-b2b | P | B2B guest objects in the resource tenant |
| https://learn.microsoft.com/en-us/entra/identity/multi-tenant-organizations/overview | P | Multi-tenant organisations |
| https://learn.microsoft.com/en-us/entra/external-id/cross-tenant-access-overview | P | Cross-tenant access settings |
| Entra issuer format `https://login.microsoftonline.com/<tid>/v2.0` | **Not fetched in this review.** From general knowledge of the Microsoft identity platform. | Basis of F-17. **Verify in the Microsoft documentation before implementing D-21.** |
| https://svelte.dev/docs/cli/paraglide; https://github.com/opral/paraglide-js/blob/main/examples/sveltekit/README.md; https://www.npmjs.com/package/@inlang/paraglide-js | P (project documentation) | Paraglide as the SvelteKit i18n integration; compile-time typing; tree-shaking |
| https://intlayer.org/blog/how-to-pick-svelte-i18n-library | V (vendor comparison) | Qualitative comparison of svelte-i18n and typesafe-i18n; cross-checked against project pages |

### 2.6 Privacy, tooling and emulators

| Source | Quality | Used for |
| --- | --- | --- |
| https://blog.localstack.cloud/localstack-single-image-next-steps | P (vendor) | Single image and auth token from 23 March 2026; free plan for non-commercial use |
| https://blog.localstack.cloud/2026-upcoming-pricing-changes; https://docs.localstack.cloud/aws/getting-started/auth-token | P (vendor) | Pricing, plans and token requirements |
| https://www.infoq.com/news/2026/02/localstack-aws-community | S | Context of the change; alternatives mentioned |
| https://floci.io/aws/compare; https://github.com/floci-io/floci | V (project pages) | Claims about Floci; treat as the project's own statements |
| https://dev.to/peytongreen_dev/localstack-is-gone-floci-vs-moto-vs-testcontainers-which-one-replaces-it-c7c and https://fakecloud.dev/blog/localstack-alternatives-compared | S | Comparison of alternatives, including Moto's licence |

## 3. Claims that rest on judgment or general knowledge

These claims are important to the recommendations. They are not established by a source in this pack, and some should be
confirmed before a decision depends on them.

| Claim | Where | Status |
| --- | --- | --- |
| ESLint 8 is past its end of life | `10` §3 | General knowledge (ESLint 8 support ended in late 2024). Confirm against the ESLint release page. |
| `pg` (node-postgres) uses unnamed statements by default, so it is compatible with transaction pooling | `05` §7 | General knowledge. Verify in the integration suite through the pooler. |
| `max_connections` on RDS PostgreSQL is derived from instance memory | `05` §7, `11` §4.2 | General knowledge. Check the parameter group. |
| CloudFront requires certificates from `us-east-1` | `11` §4.6 | General knowledge (AWS requirement). |
| HNSW memory overhead of roughly 1.3 to 2 times the raw vectors | `11` §6.2 | Order-of-magnitude judgment. Measure with a build on a real-sized copy. |
| A GPU with about 24 GB of memory suffices for an 8 to 9 billion parameter model plus an embedding model | `11` §4.5 | Assumption. Measure on the candidate hardware. |
| Docker Desktop licensing depends on organisation size and type | `12` §8 | General knowledge. Confirm with the institution. |
| Cost tiers and orders of magnitude | `11` §7 | Judgment from public list prices as remembered. **Not quoted.** Validate with the AWS Pricing Calculator. |
| The author's commit domain and the tenant name suggest a Colombian institution | `14` §8, `15` Q9 | Inference from metadata. Treat as a question, not a fact. |
| Effort estimates in weeks | `02`, `05`, `10`, `11`, `15` | Judgment for one experienced engineer. |
| Model quality rankings | `06` §4 | Taken from secondary sources and not verified on VozLab data. The evaluation in `06` §7 is the only reliable basis. |

## 4. Repository claims that were checked by reading, not running

| Claim | Basis |
| --- | --- |
| The API's approval check compares only the author hash and does not exclude agent identities | Read `proposalAuthorization.ts` and `ApproveProposalUseCase.ts`. A test is the confirmation (`09` S-15). |
| The logger does not redact query parameters | Read the redaction paths. One log line is the confirmation (`09` S-09). |
| The embedder's text is title plus description | Read `worker_embedder/handler.py`. |
| The Relator's justification and edge attributes contain the model's reason text | Read `worker_relacionador/handler.py` (lines around 101, 245 and 267). |
| The Extractor masks after reading from the stream | Read `docs/spec/extractor.md` and the worker's processing order (`06` §3.3). |

## 5. What was not done, and what would change the conclusions

| Not done | What it could change |
| --- | --- |
| Run the integration suite against PostgreSQL and Redis | Could reveal SQL or Redis defects that the unit tests do not show. Likely to confirm the findings, not overturn them. |
| Run the end-to-end suite | Could reveal UI defects. Does not affect the architectural findings. |
| Start `docker compose` and exercise the stack | Would confirm the ports and the credentials (`09` S-05) and the local AI path. |
| Pull and run the models; evaluate them on Spanish records | Would decide D-06 and D-07. The conclusions here are about process, not about model quality. |
| Run a load test | Would confirm or reject the NFR targets (NFR-01, 02, 03). Currently unknown. |
| Run `pnpm audit` and `pip-audit` | Would list known vulnerable packages. Recommended before acting on `10`. |
| Test the Relator's recall on a multi-workspace dataset | Would confirm or refute F-04. The reasoning is strong, but the evidence is a test. |
| Obtain AWS prices through the API or calculator | Would turn the cost tiers into quotes. |
| Interview the institution | Would change the priorities in `15` Part 3. |
| Review the PWA service worker and caching policy in detail | Could reveal caching of sensitive responses (`09` §7). |
| Review every route's authorisation line by line | Only the highest-risk paths were read. |

## 6. How to refresh this pack

1. Re-run the commands in section 1. The numbers in `01`, `03`, `09`, `10` and `14` depend on them.
2. Re-check the lifecycle dates in `10` against the sources in section 2.1 at each monthly review.
3. Replace each judgment in section 3 with a measurement when one exists, and record the result in the relevant ADR.
4. When a finding is closed, update its row in `01` and in `15` with the commit or ADR that closed it.
5. Keep this pack dated. A pack older than three months should be treated as history, not as status.
