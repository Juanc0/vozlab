# VozLab Extractor Worker

Agent 1 of the AI pipeline. It consumes `stream:source_raw` — the raw records
published by the ingestion gateway — with its own consumer group (`extractor`),
**masks the PII locally**, asks a local LLM for a draft node and creates it
through the API. The node is born `PENDING`; the API publishes
`NODE_CREATED`, which starts the embedding and relationship pipeline.

**Status: implemented (milestone 2.3).** The worker is not in Compose by
default (the `workers` profile) and the ingestion gateway — the producer of
`stream:source_raw` — is still missing: records are published by an external
connector or by hand.

```bash
# from the repository root, with uv installed
uv sync
uv run vozlab-worker-extractor --check   # validate config and credentials
uv run vozlab-worker-extractor           # run until SIGTERM/SIGINT
uv run vozlab-worker-extractor --once    # single pass, then exit
```

Required environment (see [ADR-0021](../../docs/decisions/ADR-0021-python-worker-runtime.md)):

```dotenv
AGENT_TOKEN=...                 # or AGENT_TOKEN_FILE
API_BASE_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379/0
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.1:8b
DEFAULT_TYPE_KEY=Problem
```

The dev seed's `agent` identity carries `type=AGENT_EXTRACTOR`, so
`db:mint-token -- --as agent` is the local token.

## Flow

1. **Resolve** the workspace through the API's source registry
   (`GET /api/v1/ingestion/resolve-source`) — the worker never chooses a
   workspace (ADR-0009, ADR-0025).
2. **Mask** the PII locally: emails, phone numbers, long digit runs, id-like
   groups and personal names become `[MASKED]`. Only the masked text is sent
   to the model (NFR-06).
3. **Extract** a draft node (`title`, `description`, `attributes`,
   `typeKey`) with the local LLM. A missing title falls back to the masked
   text; a `typeKey` the workspace does not have falls back to the default
   class.
4. **Create** the node through `POST /api/v1/nodes` (PENDING).

## Behaviour

| Situation | Outcome |
| --- | --- |
| The source is unknown (`404`) | Permanent — dead-lettered |
| The record is missing a field or is empty after masking | Permanent — dead-lettered |
| Ollama is unreachable, times out or answers badly | Retryable — the entry stays pending |
| The API rejects the node (`422`) | Permanent — dead-lettered |
| A node with the same title already exists | No action (best-effort duplicate guard) |
| The API is unavailable (`5xx`) | Retryable — the entry stays pending |

After `STREAM_MAX_ATTEMPTS` deliveries a message is copied to
`stream:source_raw:dead` (original payload, error, attempt count) and
acknowledged.

## The PII masker is rule-based

It is deterministic and local, which is what NFR-06 demands, but it is
imperfect: personal names are detected heuristically (two or more capitalised
words that are not institutional terms), so a name that looks like a common
noun is not masked. Over-masking costs a little context; under-masking would
leak personal data.
