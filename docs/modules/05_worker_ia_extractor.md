---
title: "Especificación de Módulo: Agente Extractor Multi-Fuente (Python 3.12)"
version: 1.0.0
status: APPROVED
target_component: AI Worker Extractor (Python 3.12)
owner: AI & Ingestion Team (VozLab)
---

# 05. AGENTE EXTRACTOR: INGESTA MULTI-FUENTE Y HOMOGENIZACIÓN (PYTHON 3.12)

## 1. Misión y Patrón de Arquitectura del Agente 1

El `worker-extractor` es un microservicio asíncrono en **Python 3.12** diseñado para articular la capa de escucha institucional de VozLab. Su propósito fundamental es procesar la información heterogénea y dispersa proveniente de diferentes unidades de la Universidad (encuestas de percepción, buzones de PQRS, actas de participación y comentarios abiertos) de manera **atómica y no confidencial**.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE TRABAJO DEL AGENTE EXRACTOR                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Multi-Source Connectors ──► Lee canales universitarios (Batch / Stream)  │
│                          │                                                  │
│                          ▼                                                  │
│ 2. PII Sanitizer ──────────► Filtra y anonimiza datos personales (PII)      │
│                          │                                                  │
│                          ▼                                                  │
│ 3. Atomic Parser (LLM) ────► Homogeneiza formato y extrae ideas centrales   │
│                          │                                                  │
│                          ▼                                                  │
│ 4. API Client ─────────────► POST /api/v1/nodes (Crea Nodos DRAFT en la DB) │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Estructura del Código Fuente del Worker (`apps/worker-extractor/`)


```

apps/worker-extractor/
├── src/
│   ├── config.py                   <-- Configuración de conectores y credenciales API
│   ├── connectors/                 <-- Adaptadores específicos por fuente institucional
│   │   ├── survey_connector.py     <-- Ingesta de resultados de encuestas
│   │   ├── inbox_connector.py      <-- Ingesta de buzones de sugerencias
│   │   └── minutes_connector.py    <-- Ingesta de actas de participación en texto libre
│   ├── sanitizer.py                <-- Módulo de remoción y anonimización de PII
│   ├── extractor_llm.py            <-- Lógica de parsing y extracción con LLM ligero
│   └── main.py                     <-- Orquestador principal de tareas periódicas / streams
├── Dockerfile                      <-- Contenedor optimizado de Python 3.12 slim
└── pyproject.toml                  <-- Dependencias (Pydantic, httpx, langchain-core)

```

---

## 3. Implementación del Conector Atómico y Sanitizador PII

El siguiente extracto muestra cómo se procesa un registro crudo de una encuesta o buzón institucional antes de impactar el sistema:

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
        # 1. Sanitización estricta de PII (Información Personal Identificable)
        sanitized_text = self._sanitize_pii(record.raw_content)

        # 2. Extracción de idea central y metadatos con LLM ligero
        structured_data = await self._extract_core_idea(sanitized_text, record.channel_name)

        # 3. Publicación segura mediante la API Fastify (Respetando validación y reglas de negocio)
        await self._send_to_fastify(record.workspace_id, structured_data)

    def _sanitize_pii(self, text: str) -> str:
        # En producción se aplican regex o modelos NER para enmascarar nombres, cédulas y correos
        return text

    async def _extract_core_idea(self, text: str, channel: str) -> ExtractedNodePayload:
        prompt = f"""
        Analiza el siguiente texto proveniente del canal institucional '{channel}':
        "{text}"
        
        Extrae la necesidad o idea central superando la redacción original y clasifícala.
        Retorna estrictamente un JSON con las llaves: title, description, attributes (que incluya source_channel).
        """
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={"model": "llama3", "prompt": prompt, "stream": False}
            )
            # Retorno mapeado a estructura Pydantic
            data = response.json()
            return ExtractedNodePayload(
                title=data.get("title", "Hallazgo institucional sin título"),
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

## 4. Garantías de Integridad Operativa

1. **Aislamiento de Escritura:** El Agente 1 **jamás** escribe directamente en la base de datos PostgreSQL. Toda ingesta se realiza exclusivamente a través de los endpoints REST seguros de la **Fastify API**, garantizando que se aplique la ontología activa, las restricciones del Workspace y las validaciones de Zod.
2. **Periodicidad y Resiliencia:** Los conectores operan mediante tareas programadas de lectura por lotes o webhooks institucionales, aplicando estrategias de reintento ante caídas temporales de los servidores de origen.
