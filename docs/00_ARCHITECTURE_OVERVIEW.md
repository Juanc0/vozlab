
---
title: Visión General de la Arquitectura y Estructura del Monorepo
version: 1.3.0
status: APPROVED
target_component: System Core
owner: Architecture Team (VozLab)
---

# 00. VISIÓN GENERAL DE LA ARQUITECTURA (VOZLAB)

## 1. Misión de la Plataforma y Topología Global

**VozLab** es una infraestructura B2B/Institucional diseñada para articular los diversos mecanismos de escucha, participación y atención que hoy operan de forma independiente en la Universidad[cite: 10]. 

La plataforma combina **Cómputo Determinista en Base de Datos (PostgreSQL + Apache AGE + pgvector)** con un **Trío de Agentes de IA Especializados** que aportan razonamiento semántico no-determinista[cite: 10], transformando la información dispersa en **Oportunidades de Mejora Consolidadas** para la cocreación comunitaria[cite: 10].

```mermaid
C4Context
    title Diagrama de Contexto del Sistema (C4 Level 1) - VozLab

    Person(user, "Comunidad / Aliados", "Estudiantes, Docentes, Admin y Aliados Externos")
    Person(admin, "Admin / Champions", "Líderes de proceso y Champions Institucionales")

    System(vozlab, "Plataforma VozLab", "Capa articuladora de escucha, grafos de conocimiento y cocreación")

    System_Ext(fuentes, "Fuentes de Escucha Univalle", "Encuestas, buzones, actas, canales de atención")
    System_Ext(oidc, "IdP Institucional", "Azure AD / Google Workspace (OIDC)")
    System_Ext(ollama, "Motor LLM / Embeddings", "Modelos vectoriales y LLMs de razonamiento")

    Rel(fuentes, vozlab, "Ingesta de datos no confidenciales (Stream/Batch)", "API/Connectors")
    Rel(user, vozlab, "Enriquece, apoya, comenta y propone en la PWA", "HTTPS / PWA")
    Rel(admin, vozlab, "Gestiona talleres de cocreación y validación", "HTTPS")
    Rel(vozlab, oidc, "Autentica usuarios vía SSO", "HTTPS")
    Rel(vozlab, ollama, "Genera embeddings y evalúa relaciones semánticas", "HTTP/REST")

```

---

## 2. Estructura del Monorepo (`pnpm` + Turborepo)

```
vozlab/
├── .dev-state/                      <-- Estado de desarrollo para Agentes Locales
│   ├── roadmap.json
│   ├── current_task.json
│   └── changelog_dev.md
├── apps/
│   ├── web/                         <-- PWA Frontend (SvelteKit 5 + Cytoscape.js)
│   ├── api/                         <-- Backend Principal (Fastify + TypeScript + Drizzle)
│   ├── worker-extractor/            <-- AGENTE 1: Ingesta y Estructuración (Python 3.12)
│   ├── worker-relacionador/         <-- AGENTE 2: Evaluador de Relaciones y Clusters (Python 3.12)
│   └── worker-consolidador/         <-- AGENTE 3: Consolidador de Oportunidades (Python 3.12)
├── packages/
│   ├── shared-types/                <-- Esquemas Zod y Contratos DTO compartidos (Web/API)
│   ├── database/                    <-- Esquemas Drizzle, Apache AGE (Cypher) y Migraciones
│   └── ts-config/                   <-- Configuraciones base de TypeScript
├── docker-compose.yml               <-- Entorno local (PostgreSQL+AGE+pgvector, Redis)
├── pnpm-workspace.yaml              <-- Definición de Workspaces pnpm
└── turbo.json                       <-- Pipeline de compilación Turborepo

```

---

## 3. Diagrama de Contenedores (C4 Level 2)

```mermaid
C4Container
    title Diagrama de Contenedores (C4 Level 2) - VozLab

    Container_Ext(sources, "Fuentes Universitarias", "Canales de escucha", "Encuestas, buzones, actas, comentarios")
    
    Container(worker_ext, "Agente 1: Extractor", "Python 3.12 + Parsers", "Ingesta atómica, homogeneiza y clasifica metadatos iniciales")
    Container(pwa, "PWA Client", "SvelteKit 5 + Cytoscape.js", "App de cocreación gamificada (Web & UniSabana App)")
    Container(api, "Fastify API", "Node.js 20 + Fastify", "API de negocio, valida JWT, aplica reglas y gestiona el Grafo")
    Container(redis, "Redis Broker & Cache", "Redis Streams", "Cola de eventos atómicos (NODE_CREATED) y caché de ontología")
    ContainerDb(db, "PostgreSQL 16+", "Postgres + Apache AGE + pgvector", "Persistencia unificada: SQL, Grafo LPG, HNSW Vectors y Centroides")
    
    Container(worker_rel, "Agente 2: Relacionador", "Python 3.12 + LLM", "Evalúa similitud semántica contra nodos y centroides de clusters activos")
    Container(worker_con, "Agente 3: Consolidador", "Python 3.12 + Scheduled LLM", "Sintetiza clusters densos en Oportunidades de Mejora con evidencia")

    Rel(sources, worker_ext, "Lee registros de canales", "JSON / Text / Streams")
    Rel(worker_ext, api, "Crea Nodos y Aristas preliminares", "HTTP POST /api/v1/nodes")
    Rel(pwa, api, "Interacciones de cocreación comunitarias", "HTTPS / SSE")
    Rel(api, db, "Consultas y Transacciones", "Drizzle / postgres.js")
    Rel(api, redis, "Emite eventos de nuevos nodos", "Stream: NODE_CREATED")
    
    Rel(worker_rel, redis, "Consume NODE_CREATED", "Redis Streams")
    Rel(worker_rel, db, "Pide top N Nodos/Centroides cercanos", "SQL / pgvector")
    Rel(worker_rel, api, "Propone Fusión o nueva Arista", "HTTP POST /api/v1/proposals")
    
    Rel(worker_con, db, "Consulta clusters/interacciones densas en BD", "SQL / Cypher")
    Rel(worker_con, api, "Publica Oportunidades Consolidadas sintetizadas", "HTTP POST /api/v1/opportunities")

```

---

## 4. Flujo Detallado de los 3 Agentes de IA

```mermaid
flowchart TD
    subgraph "AGENTE 1: Extractor (Ingesta Multi-Fuente)"
        A[Fuente Institucional: Encuesta/Acta] -->|Registro Atómico| B(Agente Extractor)
        B -->|Parsea y homogeneiza| C[POST /api/v1/nodes - Fastify]
        C -->|Guarda Nodo en DB| D[(PostgreSQL / Apache AGE)]
        C -->|Emite Evento| E[Redis Stream: NODE_CREATED]
    end

    subgraph "AGENTE 2: Relacionador No-Determinista (Análisis Cualitativo)"
        E --> F(Agente Relacionador)
        F -->|1. Pide Vectores/Centroides Cercanos| D
        D -->|2. Retorna Nodos + Resúmenes de Clusters| F
        F -->|3. Razonamiento Cualitativo LLM| G{¿Es Duplicado, Arista o Independiente?}
        G -->|Opción A: Duplicado| H[Propone MERGED_INTO]
        G -->|Opción B: Complementario| I[Propone Arista / Relación]
        G -->|Opción C: Nuevo Matiz| J[Mantiene Nodo Independiente]
        H & I & J -->|Notifica API| C
    end

    subgraph "AGENTE 3: Consolidador (Síntesis Macroscópica)"
        K[Job Programado / Cron] -->|1. Consulta Densidad de Grafo y Votos| D
        D -->|2. Devuelve Clusters Candidatos| K
        K -->|3. Redacta Oportunidad de Mejora| L{LLM Sintetizador}
        L -->|4. Publica Oportunidad| M[App PWA para Cocreación]
    end

```

---

## 5. Responsabilidades y Cargas de los Agentes

| Agente | Trigger / Frecuencia | Input Entregado por la BD | Tarea No-Determinista del LLM | Salida |
| --- | --- | --- | --- | --- |
| **Agente 1: Extractor** | En vivo por canal | Texto crudo de la fuente | Homogeneizar formato y extraer la idea central con metadatos ontológicos. | Nodo borrador vía API. |
| **Agente 2: Relacionador** | Evento `NODE_CREATED` | Nodo nuevo + Top 5 Nodos cercanos + Centroides de Clusters Activos | Determinar si el nodo trae un matiz suficiente para ser independiente o si debe fusionarse/relacionarse. | Propuesta de edición/arista. |
| **Agente 3: Consolidador** | Programado (Cron / Batch) | Grupos de nodos y conversaciones con alta interacción comunitaria | Redactar la **Oportunidad de Mejora Consolidada** sintetizando toda la evidencia agregada. | Oportunidad en PWA. |

---

## 6. Casos de Borde Globales y Aprendizaje Continuo

> [!NOTE]
> **Aprendizaje Semi-Supervisado:** Cuando la comunidad vota, comenta o el autor aprueba/rechaza una sugerencia del Agente 2, esta interacción se retroalimenta al sistema para ajustar los umbrales del Agente Relacionador.
> 
> 

1. **Aislación del Grafo por Workspace:** Las sugerencias de relación del Agente 2 ocurren estrictamente dentro del mismo `workspace_id`.
2. **Fallos de Conectividad con el LLM:** Si Ollama/LLM no responde durante la evaluación del Agente 2, la tarea no se pierde; queda retenida en Redis Streams para re-evaluación automática.
