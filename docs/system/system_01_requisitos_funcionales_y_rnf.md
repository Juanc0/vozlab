---
title: Especificación de Requisitos Funcionales (RF) y No Funcionales (RNF)
version: 1.0.0
status: APPROVED
target_component: System Wide
owner: Architecture & Product Team (VozLab)
---

# 01. ESPECIFICACIÓN DE REQUISITOS FUNCIONALES Y NO FUNCIONALES

## 1. Requisitos Funcionales (RF)

Los requisitos funcionales definen los comportamientos y capacidades operativas que el sistema debe proveer a los diferentes actores y servicios.

### 1.1. Identidad, Autenticación y Multi-Tenancy

* **RF-01 (Autenticación Delegada OIDC/SSO):** El sistema debe autenticar a los usuarios institucionales exclusivamente mediante proveedores de identidad externos (Microsoft Entra ID / Azure AD, Google Workspace) mediante protocolo OpenID Connect (OIDC). No se almacenarán contraseñas locales.
* **RF-02 (Aislamiento de Tenant por OIDC Claim):** El backend debe determinar el Tenant del usuario extrayendo la *claim* `tid` o `iss` del token JWT firmado y validando su registro en la tabla `auth.tenants`.
* **RF-03 (Acceso Anónimo por Código QR de Evento):** El sistema debe permitir el registro de sesiones efímeras para eventos presenciales/talleres mediante un `event_code`. Se asignará un seudónimo aleatorio y un token de dispositivo firmado. Vencido el evento, se bloquea la creación de nuevos usuarios anónimos pero los existentes conservan su acceso para dar seguimiento a sus aportes.
* **RF-04 (Gestión Multi-Workspace en URL Limpia):** La PWA debe mantener la URL pública limpia (`app.vozlab.io/`) y gestionar el contexto del espacio de trabajo (`workspace_id`) de forma aislada en el `sessionStorage` de cada pestaña.
* **RF-05 (Validación Stateless Zero-Trust):** Cada petición HTTP/REST enviada por la PWA debe incluir el header `X-Workspace-ID`. El backend en Fastify debe validar la pertenencia y los permisos del usuario sobre ese espacio específico en cada consulta.

---

### 1.2. Dominio del Grafo de Conocimiento y Metamodelo

* **RF-06 (Creación Dinámica de Nodos):** El sistema debe permitir la creación de Nodos (Problemas, Ideas, Recursos) construyendo el formulario de captura dinámicamente con base en los atributos (`datatype_properties`) definidos en la ontología activa del Workspace (`meta.*`).
* **RF-07 (Asignación de Mantenedor/Autor):** Toda entidad creada en el sistema (Nodo, Arista o Propuesta Ontológica) debe asociar el `author_hash` del creador, otorgándole el rol irrenunciable de **Mantenedor** sobre dicho objeto.
* **RF-08 (Creación de Aristas Dirigidas):** El sistema debe permitir conectar dos nodos existentes mediante una relación tipada (`object_properties`) validando las restricciones de dominio y rango de la ontología activa.
* **RF-09 (Metamodelo Dinámico Colaborativo):** Los usuarios deben poder proponer nuevos tipos de Nodos, Aristas o Atributos. Las propuestas se guardarán en `meta.*` con estado `PROPOSED` y podrán usarse localmente como borrador antes de su aprobación comunitaria o institucional.

---

### 1.3. Gobernanza Colaborativa (Flujo estilo Pull Request)

* **RF-10 (Propuestas Polimórficas de Edición):** Cualquier usuario autenticado puede proponer correcciones o adiciones sobre Nodos, Aristas o Clases Ontológicas ajenas. La sugerencia se registrará en `public.edit_proposals` como un delta (`proposed_changes JSONB`) en estado `PENDING`.
* **RF-11 (Vinculación Social):** Cada propuesta de edición debe abrir o vincularse a un hilo en `social.discussion_threads` para que la comunidad debata y emita votos informativos de respaldo (`upvotes` / `downvotes`).
* **RF-12 (Aprobación/Rechazo del Mantenedor - Merge):** El Mantenedor (autor original) del objeto debe disponer de la facultad exclusiva de aprobar (`APPROVED_BY_AUTHOR`) o rechazar (`REJECTED_BY_AUTHOR`) la propuesta. La aprobación debe aplicar los cambios de forma atómica en una transacción `UnitOfWork`.
* **RF-13 (Desbloqueo Supervisado por Moderador):** Si una propuesta de edición acumula un `community_score >= +10` y el Mantenedor permanece inactivo por más de 14 días, un Moderador/Comité autorizado puede aprobar supervisadamente la edición (`AUTO_APPLIED`).

---

### 1.4. Interacción Gamificada y Cocreación

* **RF-14 (Registro Inmutable de Interacciones):** Toda acción comunitaria (apoyar, calificar, comentar o validar relaciones) debe registrarse en `public.interactions_log` garantizando la restricción de un único voto activo por usuario y objetivo (`unique_user_target_vote`).
* **RF-15 (Actualización Atómica de Puntajes):** La base de datos debe actualizar los contadores denormalizados (`upvotes`, `downvotes`, `community_score`) de forma atómica con latencia $\mathcal{O}(1)$.
* **RF-16 (Comentarios y Discusiones Hilo):** El sistema debe soportar hilos de discusión jerárquicos normalizados en `social.discussion_posts`, permitiendo respuestas directas y votación granular por comentario individual.

---

### 1.5. Pipeline de Inteligencia Artificial (Los 3 Agentes)

* **RF-17 (Agente 1 - Ingesta Multi-Fuente Atomizada):** El **Agente Extractor** debe conectarse con canales universitarios de escucha (encuestas, buzones, actas), homogeneizar los datos no confidenciales registro por registro y crear borradores de Nodos/Aristas consumiendo la API Fastify.
* **RF-18 (Generación de Embeddings Vectoriales):** La API de Fastify debe emitir un evento a Redis Streams (`NODE_CREATED`) para que el sistema calcule de forma asíncrona el vector de 768 dimensiones (`nomic-embed-text`) y lo indexe en la columna `embedding` (`pgvector`).
* **RF-19 (Agente 2 - Evaluador de Relaciones No-Determinista):** El **Agente Relacionador** debe evaluar los nuevos nodos contrastándolos cualitativamente contra los Nodos y Centroides de Clusters Activos más cercanos devueltos por `pgvector`. La IA decidirá si el nodo se fusiona (`MERGED_INTO`), si requiere una nueva Arista o si se mantiene independiente por aportar un nuevo matiz.
* **RF-20 (Agente 3 - Consolidador de Oportunidades):** El **Agente Consolidador** debe ejecutar un proceso programado (Cron) que analice la densidad de subgrafos e interacciones comunitarias para redactar y publicar en la PWA la **"Oportunidad de Mejora Consolidada"** sintetizando toda la evidencia agregada.

---

## 2. Requisitos No Funcionales (RNF)

Los requisitos no funcionales establecen las restricciones técnicas, los atributos de calidad, el rendimiento y la seguridad del sistema.

### 2.1. Rendimiento y Escala (Performance)

* **RNF-01 (Latencia de Consulta de Subgrafos):** Las consultas de subgrafos para la PWA (<200 nodos) deben responder con un tiempo $p_{95} < 30\text{ ms}$.
* **RNF-02 (Búsqueda Vectorial HNSW):** Las búsquedas por similitud coseno en `pgvector` sobre un conjunto de 100,000 vectores deben responder en $p_{95} < 20\text{ ms}$.
* **RNF-03 (Tiempos de Respuesta HTTP):** Los endpoints de mutación (votos, creación de nodos) deben responder en $p_{95} < 15\text{ ms}$ delegando el procesamiento pesado a trabajadores asíncronos vía Redis Streams.
* **RNF-04 (Paginación Eficiente por Cursor):** Todas las listas (posts, propuestas, sugerencias) deben implementar paginación basada en cursor (`cursor-based pagination`) garantizando un rendimiento constante $\mathcal{O}(1)$ independientemente del volumen de datos.

---

### 2.2. Seguridad y Privacidad

* **RNF-05 (Cero Almacenamiento de Contraseñas):** El sistema no almacenará ni procesará contraseñas en sus bases de datos.
* **RNF-06 (Anonimización de PII en Ingesta):** El Agente Extractor debe filtrar y anonimizar cualquier Información de Identificación Personal (PII) antes de ingresar registros al sistema.
* **RNF-07 (Trazabilidad Pseudónima):** La identidad pública del usuario en el Grafo se abstraerá siempre detrás de un `author_hash` (SHA-256 de la identidad con salt institucional), impidiendo la exposición directa de datos personales en el grafo visible.
* **RNF-08 (Protección Anti-Abuso / Rate Limiting):** La Fastify API debe implementar Rate Limiting por IP/Tenant respaldado en Redis:
  * Rutas de lectura (`GET`): Máximo 300 peticiones/minuto.
  * Rutas de escritura (`POST`/`PUT`/`DELETE`): Máximo 30 peticiones/minuto.

---

### 2.3. Disponibilidad y Mantenibilidad

* **RNF-09 (Disponibilidad del Servicio):** La API Backend y el Frontend PWA deben ofrecer un SLA de disponibilidad del $99.9\%$ en horario operativo institucional.
* **RNF-10 (Resiliencia Desacoplada de IA):** Si los servicios de LLM o Embeddings (Ollama) quedan fuera de línea, la PWA y la API Fastify deben continuar funcionando al 100%. Las tareas de IA se acumularán en Redis Streams y se procesarán automáticamente al restablecerse el servicio.
* **RNF-11 (Arquitectura Hexagonal Estricta):** El código del Backend debe mantener el desacoplamiento entre las capas de Dominio, Casos de Uso e Infraestructura (Puertos y Adaptadores), permitiendo cambiar motores de base de datos o adaptadores de IA sin modificar la lógica de negocio.

---

## 3. Matriz de Trazabilidad Cruzada

| Requisito | Historias de Usuario | Componente de Código | Tablas / Persistencia |
| :--- | :--- | :--- | :--- |
| **RF-01, RF-02** | US-00, US-05 | `apps/api/src/infrastructure/identity/` | `auth.tenants`, `auth.users` |
| **RF-06, RF-07** | US-01 | `apps/api/src/application/use_cases/CreateNode.ts` | `public.nodes`, `meta.ontology_classes` |
| **RF-10, RF-12** | US-03, US-06 | `apps/api/src/application/use_cases/ApproveProposal.ts` | `public.edit_proposals`, `public.nodes` |
| **RF-14, RF-15** | US-04 | `apps/api/src/application/use_cases/VoteEntity.ts` | `public.interactions_log`, `public.edges` |
| **RF-17** | US-07 | `apps/worker-extractor/` | API Fastify (`POST /api/v1/nodes`) |
| **RF-18, RF-19** | US-08 | `apps/worker-relacionador/` | `pgvector`, `public.edit_proposals` |
| **RF-20** | US-08 | `apps/worker-consolidador/` | `public.nodes`, `social.discussion_threads` |
