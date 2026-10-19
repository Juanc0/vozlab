# Extractor Worker (`worker-extractor`)

> **Not implemented (Phase 2).** `apps/worker-extractor/` is an empty scaffold:
> no `pyproject.toml`, source files, Dockerfile or tests. This page defines the
> intended contract; nothing here runs today.

The Extractor is Agent 1: it turns heterogeneous institutional records
(surveys, suggestion boxes, meeting minutes, open comments) into draft nodes
through the Fastify API. It never writes to PostgreSQL directly.

## Responsibilities

- Consume raw records from Redis Streams (webhook/batch ingestion).
- Mask PII **before** any text leaves the worker for Ollama (NFR-06).
- Call a local LLM to extract a title, description, attributes and ontology key.
- Resolve the target workspace through the API-owned source registry.
- Create nodes with `POST /api/v1/nodes` as a system agent.
- Acknowledge the stream entry only after the API call succeeds.

## Current status

| Component | Status |
| --- | --- |
| Worker process / Python package | Not implemented |
| `stream:source_raw` producer and consumer | Not implemented |
| PII sanitizer | Not implemented |
| Ollama extraction | Not implemented |
| `meta.data_sources` registry + resolution route | Deferred to Phase 2 |
| Batch node endpoint | Does not exist |
| Root-entity cache / dedup | Phase 2 planned, not part of the contract |
| API `POST /api/v1/nodes` | Implemented and usable |

## Input: `RawSourceRecord`

The envelope is defined in `@vozlab/shared-types` as
`RawSourceRecordSchema`. The planned queue is `stream:source_raw`.

| Wire field | Type | Notes |
| --- | --- | --- |
| `sourceId` | string | External source identifier. |
| `connectorType` | enum | `MINUTES`, `SURVEY`, `INBOX`, `OPEN_COMMENT`. |
| `channelName` | string | Human-readable channel label; copied into attributes. |
| `rawContent` | string | Original non-confidential text. |

There is **no `workspaceId`** in the envelope. The API owns the mapping from
`sourceId` to workspace (`meta.data_sources`); workers never choose a workspace
from untrusted payload data. The planned resolution route is
`GET /api/v1/ingestion/resolve-source`, but neither the table nor the route
exists yet.

> **Naming mismatch:** the canonical Zod contract is **camelCase**
> (`sourceId`, `connectorType`, `channelName`, `rawContent`). The Python
> examples in the old module docs use snake_case. On the wire, camelCase wins:
> use Pydantic aliases (`Field(alias="sourceId")`) or explicitly convert. Do not
> assume the queue stores snake_case.

Connector behavior profiles are `BATCH` (surveys, large comment sets) and
`STREAM` (minutes, live channels). One worker codebase handles all connector
types.

## Processing pipeline

```mermaid
flowchart LR
    A[stream:source_raw] --> B[XREADGROUP]
    B --> C[PII masking]
    C --> D[Ollama extraction]
    D --> E[Resolve workspace]
    E --> F[POST /api/v1/nodes]
    F --> G[XACK]
    G --> H[stream:node_created via API]
```

1. **Consume.** `XREADGROUP` with a consumer group; do not `XACK` before the
   node has been accepted by the API. Unacknowledged entries stay in the PEL.
2. **Sanitize.** Replace names, emails, national IDs and similar identifiers
   with `[MASKED]`. Masking must happen locally, before the Ollama request.
3. **Extract.** Ask the LLM for strict structured output: `title`,
   `description`, `attributes`, `typeKey`. The default ontology key is
   `Problem`; `typeKey` must exist and be `ACTIVE` in the target workspace or
   the API returns `422 ERR_VALIDATION_FAILED` (FR-06).
4. **Resolve workspace.** Obtain the target workspace and authorization
   context from the API registry. The payload does not carry it.
5. **Publish.** Call `POST /api/v1/nodes`; the node is born `PENDING`.
6. **Acknowledge.** `XACK` only after a `201` response. Retry transient API or
   Ollama failures with backoff.

The Redis root-entity cache and semantic dedup are Phase 2 enhancements, not
part of the ingestion contract. They may reuse UUIDs for known faculties or
actors, but must not become a second source of truth.

## Output contract

`POST /api/v1/nodes` body:

```json
{
  "typeKey": "Problem",
  "title": "Short extracted title",
  "description": "Neutral synthesis of the record",
  "attributes": { "source_channel": "meeting-minutes" }
}
```

Required headers:

| Header | Value |
| --- | --- |
| `Authorization` | `Bearer <agent JWT>` |
| `X-Workspace-ID` | Target workspace UUID |
| `x-correlation-id` | Trace id, propagated from the stream entry |
| `content-type` | `application/json` |

Agent JWT claims: `sub` (seeded system-agent user), `tid` (must resolve in the
router DB), `jti`, `authorHash`, and `type: "AGENT_EXTRACTOR"`. Agents skip
workspace membership checks but are still workspace-scoped by the header.
There is no API key and no author salt.

### Batch ingestion is not available

`BatchCreateNodeSchema` exists as a contract only: `{ nodes: [1..1000] }`.
There is no batch route. Whether the worker should post one node per request or
a batch endpoint should be added is an **open decision**; until then, use the
single-node endpoint and respect its rate limit (30 writes/minute per actor by
default; agents are actors too).

## Minimal Python shape

```python
from pydantic import BaseModel, ConfigDict, Field

class RawSourceRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    source_id: str = Field(alias="sourceId")
    connector_type: str = Field(alias="connectorType")
    channel_name: str = Field(alias="channelName")
    raw_content: str = Field(alias="rawContent")

class ExtractedNodePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    type_key: str = Field(default="Problem", alias="typeKey")
    title: str
    description: str
    attributes: dict
```

Send `payload.model_dump(by_alias=True)` so the API receives `typeKey`.

## Resilience and open questions

- Use a consumer group and `XAUTOCLAIM`/`XCLAIM` to recover entries from dead
  consumers; bound retries and define a dead-letter policy (none exists).
- Define an idempotency key so a retry after a timed-out `201` does not create a
  duplicate node. No server-side idempotency key exists today.
- Decide whether an AWS API Gateway + Lambda ingestion front door is adopted.
  It is an **open option**, not a decision; Redis Streams is the current plan.
- Define agent credential issuance/rotation. Dev tokens are minted manually.
- Confirm the final `attributes` vocabulary per node type with the ontology.

## Phase 2 acceptance criteria

- [ ] Reads `stream:source_raw` with `XREADGROUP` and `XACK`s only on success.
- [ ] Masks PII before every Ollama call.
- [ ] Returns a validated `ExtractedNodePayload` (default `Problem`).
- [ ] Sends agent JWT, `X-Workspace-ID` and `x-correlation-id`.
- [ ] Creates nodes only through the API, never with direct SQL.
- [ ] Recovers pending entries and retries without duplicating nodes.

## Related

- [architecture.md](../architecture.md) — agent topology.
- [domain-model.md](../domain-model.md) — node/ontology shapes.
- [auth-and-tenancy.md](../auth-and-tenancy.md) — agent identity and workspace
  isolation.
- [api-reference.md](../api-reference.md) — `POST /api/v1/nodes` and errors.
- [relator.md](relator.md) — downstream consumer of `stream:node_created`.
