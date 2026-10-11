---
title: "Especificación de Módulo: Agente Relacionador (Python 3.12 y pgvector)"
version: 1.0.0
status: APPROVED
target_component: AI Worker Relacionador (Python 3.12)
owner: AI & Backend Team (VozLab)
---

# 04. AGENTE RELACIONADOR: EVALUACIÓN SEMÁNTICA Y CLUSTERING (PYTHON 3.12)

## 1. Arquitectura y Ciclo de Vida del Worker

El `worker-relacionador` es un microservicio asíncrono desarrollado en **Python 3.12** que opera desacoplado de la API Fastify. Su responsabilidad central es evaluar cualitativamente cada nuevo nodo creado en el sistema utilizando un enfoque híbrido: **Cómputo Vectorial determinista en Base de Datos + Razonamiento Semántico no-determinista con LLM local (Ollama)**.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                   CICLO DE VIDA DEL WORKER RELACIONADOR                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Event Consumer ──► Escucha Redis Streams (`node:created`)                 │
│                          │                                                  │
│                          ▼                                                  │
│ 2. DB Query (pgvector)──► Obtiene Top 5 Nodos cercanos y Centroides Activos  │
│                          │                                                  │
│                          ▼                                                  │
│ 3. LLM Qualitative Evaluation ──► Analiza contexto y matices institucionales│
│                          │                                                  │
│                          ▼                                                  │
│ 4. Action Dispatcher ──► Envía Propuesta de Fusión, Arista o Independiente   │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Estructura del Código Fuente del Worker (`apps/worker-relacionador/`)


```

apps/worker-relacionador/
├── src/
│   ├── config.py                   <-- Configuración y lectura de variables con Pydantic-Settings
│   ├── redis_client.py             <-- Cliente de Redis Streams (XREAD / XACK)
│   ├── db_client.py                <-- Conexión PostgreSQL / psycopg3 para pgvector y AGE
│   ├── llm_client.py               <-- Conexión HTTP con Ollama API (Embeddings y Prompting)
│   ├── evaluator.py                <-- Lógica central del análisis semántico cualitativo
│   └── main.py                     <-- Bucle principal de ejecución del worker
├── Dockerfile                      <-- Contenedor optimizado de Python 3.12 slim
└── pyproject.toml                  <-- Dependencias gestionadas con Poetry / pip

```

---

## 3. Implementación del Consumidor de Eventos y Evaluación Semántica

A continuación se presenta el código base que implementa el ciclo de consumo de Redis Streams y la consulta combinada con `pgvector`:

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
                # 1. Obtiene el nodo recién creado
                cur.execute(
                    "SELECT title, description, embedding FROM public.nodes WHERE id = %s;",
                    (node_id,)
                )
                node = cur.fetchone()
                if not node:
                    return
                
                title, description, embedding = node

                # 2. Busca los 5 vecinos más cercanos en pgvector (Similitud Coseno)
                cur.execute("""
                    SELECT id, title, description, 
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM public.nodes
                    WHERE workspace_id = %s AND id != %s AND embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT 5;
                """, (embedding, workspace_id, node_id, embedding))
                
                nearest_nodes = cur.fetchall()

        # 3. Construye el contexto enriquecido para el Agente (LLM)
        context_prompt = self._build_prompt(title, description, nearest_nodes)
        
        # 4. Evaluación cualitativa con LLM (Ollama)
        evaluation_result = await self._query_llm(context_prompt)

        # 5. Ejecuta la acción recomendada (Fusión, Arista o Mantener Independiente)
        self._dispatch_action(node_id, evaluation_result)

    def _build_prompt(self, title: str, description: str, neighbors: list) -> str:
        neighbors_text = "\n".join([f"- ID: {n[0]}, Título: {n[1]}, Similitud: {n[3]:.2f}" for n in neighbors])
        return f"""
        Actúa como un analista institucional experto en gobernanza de conocimiento.
        Evalúa si el siguiente Nuevo Nodo debe fusionarse, relacionarse o mantenerse independiente.
        
        NUEVO NODO:
        Título: {title}
        Descripción: {description}
        
        NODOS EXISTENTES CERCANOS (por similitud vectorial):
        {neighbors_text}
        
        Responde estrictamente en formato JSON con la estructura:
        {{"action": "MERGE" | "EDGE" | "INDEPENDENT", "target_id": "uuid o null", "reason": "explicación"}}
        """

    async def _query_llm(self, prompt: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={"model": "llama3", "prompt": prompt, "stream": False}
            )
            # Parseo de respuesta JSON del LLM
            return response.json()

    def _dispatch_action(self, node_id: str, result: dict):
        # Envía la propuesta resultante a la API Fastify o escribe en DB según el caso
        pass

```

---

## 4. Gestión de Concurrencia y Resiliencia (Redis Streams PEL)

* **Pending Entries List (PEL):** El worker procesa los mensajes de Redis utilizando `XREADGROUP` y confirma su procesamiento mediante `XACK`. Si el contenedor del worker falla durante la evaluación del LLM, el mensaje permanece en la cola de pendientes y es reasignado automáticamente a otra instancia al reiniciarse.
* **Control de Costos y Tokens:** Al limitar la consulta vectorial previa en `pgvector` a los 5 vecinos más cercanos, el Agente 2 recibe un contexto sumamente acotado (menor a 500 tokens), garantizando latencias inferiores a $1.2\text{ segundos}$ por nodo evaluado y un costo computacional mínimo.
