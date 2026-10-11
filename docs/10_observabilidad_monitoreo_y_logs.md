
# ESPECIFICACIÓN DE OBSERVABILIDAD, MONITOREO Y LOGGING (VOZLAB)

## 1. Estrategia de Trazabilidad End-to-End (Correlation ID)

Para correlacionar eventos a través de las diferentes capas del sistema (PWA, API Fastify, Redis Streams y Workers de IA), se implementa un identificador único de trazabilidad denominado **Correlation ID (`reqId`)**.


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                       FLUJO DE TRAZABILIDAD (reqId)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ PWA SvelteKit ──► Genera o propaga 'x-correlation-id: uuid-123'              │
│                          │                                                  │
│                          ▼                                                  │
│ Fastify API ────► Contextualiza AsyncLocalStorage con 'reqId'               │
│                          │                                                  │
│                          ├─► Logs JSON (Pino) incluyen { reqId, tenantId }  │
│                          │                                                  │
│                          ▼                                                  │
│ Redis Streams ──► Publica evento con payload: { meta: { reqId: 'uuid-123' } }│
│                          │                                                  │
│                          ▼                                                  │
│ Python Worker ──► Extrae 'reqId' y formatea structlog para rastreo continuo  │
└─────────────────────────────────────────────────────────────────────────────┘

```

### 1.1. Propagación en el Backend (AsyncLocalStorage)
* En la API (Node.js), el middleware de Fastify utiliza `AsyncLocalStorage` para almacenar el `reqId`, `tenantId` y `workspaceId` de la petición HTTP entrante.
* Toda llamada a log dentro de cualquier capa (Casos de Uso, Repositorios o Adaptadores) adjunta automáticamente este contexto sin necesidad de pasarlo manualmente como parámetro en las funciones.

---

## 2. Logging Estructurado JSON

Toda la salida de registros (*logs*) de la plataforma se realiza estrictamente en formato **JSON estructurado** hacia `stdout` / `stderr`, facilitando la ingesta y parseo por recolectores como Datadog, Grafana Loki o AWS CloudWatch.

### 2.1. Formato Estándar de Traza
```json
{
  "level": "info",
  "time": "2026-10-11T16:45:00.123Z",
  "reqId": "123e4567-e89b-12d3-a456-426614174000",
  "tenantId": "sabana",
  "workspaceId": "ingenieria",
  "service": "api-fastify",
  "module": "use_case.approve_proposal",
  "msg": "Edit proposal approved successfully",
  "durationMs": 14.2,
  "params": {
    "proposalId": "987f6543-e21b-12d3-a456-426614174000",
    "targetNodeId": "456e7890-e89b-12d3-a456-426614174000"
  }
}

```

### 2.2. Librerías Utilizadas

* **Fastify API (Node.js):** **Pino Logger** (logger asíncrono de ultra alto rendimiento y bajo consumo de CPU).
* **Worker IA (Python):** **`structlog`** configurado para emitir campos idénticos a los de Pino para homogenizar la analítica.

---

## 3. Endpoints de Salud y Probes de Orquestación

Para permitir que orquestadores (Kubernetes, Docker Swarm o Render/AWS) monitoreen la disponibilidad del sistema, la API expone los patrones estándar de **Healthcheck**:

1. **`GET /health/live` (Liveness Probe):**
* Responde `200 OK { "status": "alive" }` si el proceso Node.js está respondiendo eventos. Se usa para reiniciar el contenedor si se congela.


2. **`GET /health/ready` (Readiness Probe):**
* Verifica conectividad activa contra PostgreSQL y Redis.
* Responde `200 OK { "status": "ready", "checks": { "database": "up", "redis": "up" } }`.
* Si la base de datos no responde, retorna `503 Service Unavailable`, sacando temporalmente la instancia del balanceador de carga sin destruir el contenedor.



---

## 4. Telemetría de Rendimiento y Alertas Críticas

Se monitorean métricas clave de salud del sistema (*Golden Signals*):

* **Latencia de Consultas Cypher / AGE:** Monitoreo especial para consultas a Apache AGE que superen los $50\text{ ms}$, emitiendo una traza de nivel `warn` para optimización de índices B-Tree/GIN.
* **Tasa de Errores HTTP 5xx:** Alerta cuando el porcentaje de errores 5xx supere el $1\%$ del tráfico total en un período de 5 minutos.
* **Crecimiento de Colas en Redis (Pending Entries):** Monitoreo sobre la profundidad de mensajes no procesados en `stream:ia_tasks`. Si acumula más de 100 eventos pendientes, activa alertas de escalamiento para ajustar la cantidad de réplicas del `worker-ia`.

