---
title: "Module Specification: Relator Agent (Python 3.12 and pgvector)"
version: 1.0.0
status: APPROVED
target_component: AI Worker Relator (Python 3.12)
owner: AI & Backend Team (VozLab)
---

# 04. RELATOR AGENT: SEMANTIC EVALUATION AND CLUSTERING (PYTHON 3.12)


## 1. Semantic Evaluation Scope (Nodes and Edges)

The `worker-relacionador` (Python 3.12) processes atomic events from Redis Streams and runs a hybrid analysis (pgvector + LLM). 

- **Relationship Evaluation:** When the agent detects relevant semantic affinity between nodes, it **does not create direct edges**; instead it emits an **Edge Proposal (`EDGE_PROPOSAL`)** in `PENDING` status, which is associated with a discussion thread so that the community and the maintainers can validate whether the proposed relationship type is correct.

---

## 1. Worker Architecture and Lifecycle

The `worker-relacionador` is an asynchronous microservice developed in **Python 3.12** that operates decoupled from the Fastify API. Its central responsibility is to qualitatively evaluate each new node created in the system using a hybrid approach: **deterministic Vector Computation in the Database + non-deterministic Semantic Reasoning with a local LLM (Ollama)**.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                   RELATOR WORKER LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Event Consumer ──► Listens to Redis Streams (`node:created`)             │
│                          │                                                  │
│                          ▼                                                  │
│ 2. DB Query (pgvector)──► Gets Top 5 nearby Nodes and Active Centroids      │
│                          │                                                  │
│                          ▼                                                  │
│ 3. LLM Qualitative Evaluation ──► Analyzes context and institutional nuances│
│                          │                                                  │
│                          ▼                                                  │
│ 4. Action Dispatcher ──► Sends Merge, Edge or Independent Proposal          │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Worker Source Code Structure (`apps/worker-relacionador/`)


```

apps/worker-relacionador/
├── src/
│   ├── config.py                   <-- Configuration and variable reading with Pydantic-Settings
│   ├── redis_client.py             <-- Redis Streams client (XREAD / XACK)
│   ├── db_client.py                <-- PostgreSQL / psycopg3 connection for pgvector and AGE
│   ├── llm_client.py               <-- HTTP connection with Ollama API (Embeddings and Prompting)
│   ├── evaluator.py                <-- Central logic of the qualitative semantic analysis
│   └── main.py                     <-- Main execution loop of the worker
├── Dockerfile                      <-- Optimized Python 3.12 slim container
└── pyproject.toml                  <-- Dependencies managed with Poetry / pip

```

---

## 3. Event Consumer and Semantic Evaluation Implementation

Below is the base code that implements the Redis Streams consumption cycle and the combined query with `pgvector`:

```python
# apps/worker-relacionador/src/evaluator.py
import os
import psycopg
import httpx
from pydantic import BaseModel

class RelationEvaluator:
    def __init__(self, db_url: str, ollama_url: str):
        self.db_url = db_url
        self.ollama_url = ollama_url

    async def evaluate_node(self, node_id: str, workspace_id: str):
        with psycopg.connect(self.db_url) as conn:
            with conn.cursor() as cur:
                # 1. Gets the newly created node
                cur.execute(
                    "SELECT title, description, embedding FROM public.nodes WHERE id = %s;",
                    (node_id,)
                )
                node = cur.fetchone()
                if not node:
                    return
                
                title, description, embedding = node

                # 2. Finds the 5 nearest neighbors in pgvector (Cosine Similarity)
                cur.execute("""
                    SELECT id, title, description, 
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM public.nodes
                    WHERE workspace_id = %s AND id != %s AND embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT 5;
                """, (embedding, workspace_id, node_id, embedding))
                
                nearest_nodes = cur.fetchall()

        # 3. Builds the enriched context for the Agent (LLM)
        context_prompt = self._build_prompt(title, description, nearest_nodes)
        
        # 4. Qualitative evaluation with LLM (Ollama)
        evaluation_result = await self._query_llm(context_prompt)

        # 5. Executes the recommended action (Merge, Edge or Keep Independent)
        self._dispatch_action(node_id, evaluation_result)

    def _build_prompt(self, title: str, description: str, neighbors: list) -> str:
        neighbors_text = "\n".join([f"- ID: {n[0]}, Title: {n[1]}, Similarity: {n[3]:.2f}" for n in neighbors])
        return f"""
        Act as an institutional analyst expert in knowledge governance.
        Evaluate whether the following New Node should be merged, related, or kept independent.
        
        NEW NODE:
        Title: {title}
        Description: {description}
        
        NEARBY EXISTING NODES (by vector similarity):
        {neighbors_text}
        
        Respond strictly in JSON format with the structure:
        {{"action": "MERGE" | "EDGE" | "INDEPENDENT", "target_id": "uuid or null", "reason": "explanation"}}
        """

    async def _query_llm(self, prompt: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={"model": "llama3", "prompt": prompt, "stream": False}
            )
            # Parsing of the LLM JSON response
            return response.json()

    def _dispatch_action(self, node_id: str, result: dict):
        # Sends the resulting proposal to the Fastify API or writes to the DB depending on the case
        pass

```

---

## 4. Concurrency and Resilience Management (Redis Streams PEL)

* **Pending Entries List (PEL):** The worker processes Redis messages using `XREADGROUP` and confirms their processing via `XACK`. If the worker container fails during the LLM evaluation, the message remains in the pending queue and is automatically reassigned to another instance upon restart.
* **Cost and Token Control:** By limiting the prior vector query in `pgvector` to the 5 nearest neighbors, Agent 2 receives a highly bounded context (under 500 tokens), guaranteeing latencies below $1.2\text{ seconds}$ per evaluated node and a minimal computational cost.
