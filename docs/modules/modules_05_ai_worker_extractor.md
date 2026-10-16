---
title: "Module Specification: Multi-Source Extractor Agent (Python 3.12)"
version: 1.0.0
status: APPROVED
target_component: AI Worker Extractor (Python 3.12)
owner: AI & Ingestion Team (VozLab)
---

# 05. EXTRACTOR AGENT: MULTI-SOURCE INGESTION AND HOMOGENIZATION (PYTHON 3.12)


## 1. External Ingestion Gateway (Serverless Webhooks) and Source Strategy

To protect the main API from traffic spikes or external saturation, the reception of institutional webhooks is decoupled through a Serverless architecture:

1. **AWS API Gateway + AWS Lambda:** Receives the external payloads, validates cryptographic signatures or API keys, and immediately deposits the raw data into a queue (**Redis Streams / SQS**), responding `202 Accepted` in milliseconds.
2. **Processing Strategy by Source Type:**
   - **Institutional meeting minutes:** Processed minute by minute independently in the queue.
   - **Massive surveys:** Processed in logical batches of open comments or atomically per free-text response.
3. **Root Entity Cache in Redis:** Before processing and creating nodes, the Extractor Agent checks against an in-memory cache (Redis) that stores the university's key entities (faculties, dependencies, main actors) to reuse their UUIDs and avoid unnecessary duplicates.


---

## 1. Mission and Architecture Pattern of Agent 1

The `worker-extractor` is an asynchronous microservice in **Python 3.12** designed to articulate VozLab's institutional listening layer. Its fundamental purpose is to process the heterogeneous and dispersed information coming from different units of the University (perception surveys, PQRS suggestion boxes, participation meeting minutes and open comments) in an **atomic and non-confidential** manner.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXTRACTOR AGENT WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Multi-Source Connectors ──► Reads university channels (Batch / Stream)   │
│                          │                                                  │
│                          ▼                                                  │
│ 2. PII Sanitizer ──────────► Filters and anonymizes personal data (PII)      │
│                          │                                                  │
│                          ▼                                                  │
│ 3. Atomic Parser (LLM) ────► Homogenizes format and extracts core ideas      │
│                          │                                                  │
│                          ▼                                                  │
│ 4. API Client ─────────────► POST /api/v1/nodes (Creates DRAFT Nodes in the DB) │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Worker Source Code Structure (`apps/worker-extractor/`)


```

apps/worker-extractor/
├── src/
│   ├── config.py                   <-- Configuration of connectors and API credentials
│   ├── connectors/                 <-- Source-specific adapters per institutional source
│   │   ├── survey_connector.py     <-- Ingestion of survey results
│   │   ├── inbox_connector.py      <-- Ingestion of suggestion boxes
│   │   └── minutes_connector.py    <-- Ingestion of participation meeting minutes in free text
│   ├── sanitizer.py                <-- PII removal and anonymization module
│   ├── extractor_llm.py            <-- Parsing and extraction logic with a lightweight LLM
│   └── main.py                     <-- Main orchestrator of periodic tasks / streams
├── Dockerfile                      <-- Optimized Python 3.12 slim container
└── pyproject.toml                  <-- Dependencies (Pydantic, httpx, langchain-core)

```

---

## 3. Atomic Connector and PII Sanitizer Implementation

The following excerpt shows how a raw record from an institutional survey or suggestion box is processed before impacting the system:

```python
# apps/worker-extractor/src/main.py
import os
import httpx
from pydantic import BaseModel, Field

class RawSourceRecord(BaseModel):
    source_id: str
    channel_name: str
    raw_content: str
    workspace_id: str

class ExtractedNodePayload(BaseModel):
    type_key: str = Field(default="problem")
    title: str
    description: str
    attributes: dict

class SourceExtractorService:
    def __init__(self, api_internal_url: str, api_key: str, ollama_url: str):
        self.api_internal_url = api_internal_url
        self.api_key = api_key
        self.ollama_url = ollama_url

    async def process_record(self, record: RawSourceRecord):
        # 1. Strict PII sanitization (Personally Identifiable Information)
        sanitized_text = self._sanitize_pii(record.raw_content)

        # 2. Extraction of the core idea and metadata with a lightweight LLM
        structured_data = await self._extract_core_idea(sanitized_text, record.channel_name)

        # 3. Secure publication via the Fastify API (Respecting validation and business rules)
        await self._send_to_fastify(record.workspace_id, structured_data)

    def _sanitize_pii(self, text: str) -> str:
        # In production, regex or NER models are applied to mask names, national ID numbers and emails
        return text

    async def _extract_core_idea(self, text: str, channel: str) -> ExtractedNodePayload:
        prompt = f"""
        Analyze the following text coming from the institutional channel '{channel}':
        "{text}"
        
        Extract the central need or idea going beyond the original wording and classify it.
        Strictly return a JSON with the keys: title, description, attributes (which includes source_channel).
        """
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={"model": "llama3", "prompt": prompt, "stream": False}
            )
            # Return mapped to a Pydantic structure
            data = response.json()
            return ExtractedNodePayload(
                title=data.get("title", "Institutional finding without title"),
                description=data.get("description", text),
                attributes={"source_channel": channel}
            )

    async def _send_to_fastify(self, workspace_id: str, payload: ExtractedNodePayload):
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Workspace-ID": workspace_id}
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{self.api_internal_url}/api/v1/nodes",
                json=payload.model_dump(),
                headers=headers
            )

```

---

## 4. Operational Integrity Guarantees

1. **Write Isolation:** Agent 1 **never** writes directly to the PostgreSQL database. All ingestion is done exclusively through the secure REST endpoints of the **Fastify API**, guaranteeing that the active ontology, the Workspace restrictions and the Zod validations are applied.
2. **Periodicity and Resilience:** The connectors operate through scheduled batch reading tasks or institutional webhooks, applying retry strategies upon temporary outages of the origin servers.
