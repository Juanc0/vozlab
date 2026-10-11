
# ESPECIFICACIÓN TÉCNICA DEL WORKER DE IA Y PIPELINE ASÍNCRONO (VOZLAB)

## 1. Arquitectura del Worker (Python 3.12 + Pydantic v2)

El procesamiento pesado de Inteligencia Artificial se aísla de la API web mediante un proceso Worker desacoplado desarrollado en **Python 3.12**, optimizado para el ecosistema nativo de IA y procesamiento vectorial.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PIPELINE DE PROCESAMIENTO DE IA                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fastify API ──► Publica evento en Redis Stream ('stream:ia_tasks')          │
│                                │                                            │
│                                ▼                                            │
│ Python Worker (Consumer Group) ──► Lee evento y valida schema (Pydantic v2) │
│                                │                                            │
│                ┌───────────────┴───────────────┐                            │
│                ▼                               ▼                            │
│   [Tarea 1: Embedding]            [Tarea 2: Agente Extractor]               │
│   Ollama API (nomic-embed-text)   LangChain / Pydantic Output Parser        │
│                │                               │                            │
│                └───────────────┬───────────────┘                            │
│                                ▼                                            │
│   Persistencia: PostgreSQL 16+ (pgvector + Apache AGE via psycopg3)         │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## 2. Consumo de Eventos y Resiliencia (Redis Streams + DLQ)

### 2.1. Patrón Consumer Group
El Worker se registra dentro de un **Redis Consumer Group** (`ia_workers_group`). Esto permite escalar horizontalmente agregando múltiples contenedores `worker-ia` en paralelo sin duplicar el procesamiento de mensajes.

### 2.2. Manejo de Fallos y Dead Letter Queue (DLQ)
Si el motor de LLM (Ollama) o la base de datos no responden durante el procesamiento de un evento:
1. **Reintentos Exponenciales (Exponential Backoff):** El Worker reintenta la tarea hasta **3 veces** con tiempos de espera crecientes (2s, 8s, 32s).
2. **Reclamación de Mensajes Pendientes (Pending Entries List - PEL):** Si un contenedor Worker colapsa a mitad de procesamiento, otro Worker disponible reclama los mensajes colgados usando `XCLAIM`.
3. **Dead Letter Queue (DLQ):** Si tras 3 intentos la tarea continúa fallando, el mensaje se traslada al Stream `stream:ia_tasks:dlq` para inspección y auditoría humana, evitando bloquear la cola principal.

---

## 3. Tareas Principales del Pipeline de IA

### 3.1. Agente Relacionador (Calculo Vectorial y Deduplicación)
* **Generación de Embeddings:** Consume eventos `NODE_CREATED` o `NODE_UPDATED`. Utiliza el modelo `nomic-embed-text` (768 dimensiones) para generar el vector embedding del título y descripción del nodo.
* **Búsqueda Coseno en `pgvector`:** Ejecuta una consulta HNSW en PostgreSQL para identificar nodos con similitud $> 0.92$.
* **Sugerencia Automática:** Si detecta duplicación, genera una propuesta de fusión (`MERGED_INTO`) en `public.edit_proposals`. Si detecta complementariedad, sugiere una arista (`public.edges`) en estado `PROPOSED`.

### 3.2. Agente Extractor (Estructuración de Texto No Estructurado)
* **Transformación a JSON Ontológico:** Procesa documentos, actas o comentarios extensos. Lee la ontología activa en la caché de Redis y utiliza Pydantic Output Parsers para estructurar el texto crudo en borradores de Nodos (`DRAFT`) validados contra la ontología del Workspace.

---

## 4. Conexión a Persistencia y Tipado

* **Driver PostgreSQL:** Utiliza `psycopg3` con soporte nativo para `pgvector` y ejecución asíncrona (`asyncio`).
* **Seguridad Multi-Tenant:** Todas las consultas de lectura y actualización vectorial incluyen de forma obligatoria las cláusulas `WHERE tenant_id = %s AND workspace_id = %s` para garantizar el aislamiento estricto de datos entre instituciones.
