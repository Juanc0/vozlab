
# ESPECIFICACIÓN DE CASOS DE USO E HISTORIAS DE USUARIO (VOZLAB)

## 1. Mapeo de Actores del Sistema y Modelo de Identidad

| Actor | Descripción | Nivel de Acceso y Contexto | Tipo de Identidad |
| --- | --- | --- | --- |
| **Administrador Institucional (Tenant Admin)** | Administrador de la Universidad/Institución. Gestiona los Workspaces del Tenant (`tid`) y miembros. | Global del Tenant (`tid`). | Nombre/Correo autenticado vía OIDC/SSO (Azure AD / Google). |
| **Usuario PWA (Común)** | Estudiante, docente o investigador. Crea nodos, argumenta, propone ediciones y participa en discusiones. | Específico por Workspace (`X-Workspace-ID`). | Pseudónima (`author_hash` derivado de la sesión SSO activa). |
| **Mantenedor / Autor** | Usuario que creó un Nodo, Arista o Propuesta de Ontología específico. Actúa como responsable del "Pull Request". | Ámbito del objeto en el Workspace. | Pseudónima (`author_hash` coincidente con el creador del objeto). |
| **Comité / Moderador** | Rol institucional supervisado para resolver estancamientos o intervenir en contenidos bloqueados por inactividad. | Específico por Workspace / Tenant. | Pseudónima con privilegios elevados (`ROLE_ADMIN` / `ROLE_MODERATOR`). |
| **Agente Extractor (IA)** | Servicio asíncrono en segundo plano que analiza fuentes no estructuradas y crea borradores de Nodos. | Servicio de Sistema (Worker API). | Bot de Sistema (`AGENT_EXTRACTOR`). |
| **Agente Relacionador (IA)** | Servicio asíncrono que calcula embeddings, detecta duplicados y sugiere aristas/fusiones. | Servicio de Sistema (Worker API). | Bot de Sistema (`AGENT_RELACIONADOR`). |

---

## 2. Definición de Contextos y Jerarquía Multi-Tenant

1. **Aislamiento por Tenant (`tid` / OIDC Claim):**
* Cada institución cliente tiene una instancia provisionada cuyo Tenant ID (`tid`) se extrae de la delegación OIDC/SSO (ej. Azure AD Tenant ID o dominio institucional).
* No existen contraseñas locales; la autenticación es 100% delegada.


2. **Navegación por Workspaces (Estilo Slack / Obsidian Vaults):**
* Un Tenant contiene múltiples Workspaces (ej. *"Campus General"*, *"Facultad de Ingeniería"*, *"Grupo de Investigación IA"*).
* La PWA mantiene la **URL Limpia (`app.vozlab.io/`)** y gestiona el `workspace_id` activo en el **`sessionStorage` independiente por pestaña**.
* Cada petición HTTP de la PWA adjunta el header `X-Workspace-ID`. El backend en Fastify valida la pertenencia y permisos del usuario en cada petición (*Stateless Zero-Trust Validation*).



---

## 3. Historias de Usuario por Actor

### 3.1. Administrador Institucional (Tenant Admin)

#### US-00: Provisión y Gestión de Workspaces

* **Como** Administrador Institucional,
* **Quiero** crear y configurar un espacio de trabajo (Workspace) asignando sus parámetros y administradores iniciales,
* **Para** organizar el trabajo colaborativo de una facultad o proyecto sin mezclar contextos de datos.
* **Criterios de Aceptación:**
1. Se verifica que la sesión del usuario pertenezca al Tenant ID (`tid`) actual.
2. Crea un registro en `auth.workspaces` y le asigna la ontología por defecto en `meta.*`.
3. No modifica la URL pública; el nuevo workspace queda disponible en la lista del selector de la PWA.



---

### 3.2. Usuario PWA (Común)

#### US-01: Creación de un Nodo en el Grafo (Idea, Problema, Recurso)

* **Como** Usuario PWA autenticado en un Workspace activo,
* **Quiero** redactar una nueva iniciativa o reporte seleccionando un tipo de la ontología activa,
* **Para** visibilizar un problema o solución en el grafo institucional.
* **Criterios de Aceptación:**
1. El formulario de la PWA solicita dinámicamente los atributos definidos en `meta.datatype_properties` para la clase elegida.
2. Al guardar, el backend registra el Nodo en `public.nodes` asignando la combinación `(tenant_id, workspace_id)` y el `author_hash` del creador (otorgándole el rol de **Mantenedor** sobre este elemento).
3. Se emite un evento a Redis Streams (`NODE_CREATED`) para que el Agente Relacionador calcule el vector de similitud.
4. La PWA actualiza el subgrafo en pantalla mediante SvelteKit 5 Runes (`$state`) sin recargar la página.



#### US-02: Propuesta de un Nuevo Tipo Ontológico o Atributo

* **Como** Usuario PWA,
* **Quiero** sugerir un nuevo tipo de Nodo, Arista o Atributo que no existe en el catálogo ontológico actual,
* **Para** expandir la capacidad expresiva de la plataforma según las necesidades del debate.
* **Criterios de Aceptación:**
1. La propuesta se guarda en el esquema `meta` con estado `PROPOSED`.
2. El usuario creador puede utilizar la propuesta inmediatamente en modo borrador local dentro de su Workspace.
3. Se abre automáticamente un hilo de discusión en `social.discussion_threads`.



#### US-03: Propuesta de Edición sobre Contenido Existente (Pull Request)

* **Como** Usuario PWA,
* **Quiero** proponer una corrección, complemento o mejora de redacción sobre un Nodo o Arista ajeno,
* **Para** elevar la precisión de la información sin sobrescribir destructivamente el trabajo de otro.
* **Criterios de Aceptación:**
1. Se genera un registro inmutable en `public.edit_proposals` con los cambios en formato delta (`proposed_changes JSONB`) y estado `PENDING`.
2. Se notifica al Mantenedor/Autor del objeto original.
3. La propuesta se vincula al hilo de discusión para recibir votos informativos de la comunidad.



#### US-04: Votación e Interacción Micro-Gamificada

* **Como** Usuario PWA,
* **Quiero** calificar propuestas de edición, validar relaciones sugeridas por IA o responder micro-preguntas sobre Nodos,
* **Para** filtrar contenido relevante y ayudar a la comunidad a llegar a consensos.
* **Criterios de Aceptación:**
1. Cada acción registra una entrada inmutable en `public.interactions_log`.
2. La base de datos ejecuta una transacción en `UnitOfWork` que actualiza los contadores denormalizados (`upvotes`, `downvotes`, `community_score`) en $\mathcal{O}(1)$.
3. El sistema valida la restricción de un único voto activo por usuario y objetivo (`unique_user_target_vote`).



#### US-05: Navegación y Conmutación de Contexto Multi-Pestaña

* **Como** Usuario PWA,
* **Quiero** cambiar de espacio de trabajo desde el selector del panel lateral en una pestaña sin afectar el contexto de otras pestañas abiertas,
* **Para** trabajar de forma paralela en múltiples proyectos o facultades sin interferencias.
* **Criterios de Aceptación:**
1. La selección actualiza el `workspace_id` en el **`sessionStorage`** exclusivo de la pestaña de forma instantánea ($0\text{ ms}$).
2. Las peticiones subsequentes envían el header `X-Workspace-ID` correspondiente a esa pestaña.
3. El motor visual (Cytoscape.js) descarga y anima el nuevo subgrafo de forma independiente.



---

### 3.3. Mantenedor / Autor del Objeto

#### US-06: Revisión, Fusión o Rechazo de Propuestas (Merge / Reject)

* **Como** Mantenedor/Autor de un Nodo, Arista o Elemento Ontológico,
* **Quiero** evaluar las propuestas de edición que otros usuarios han realizado sobre mi contenido,
* **Para** aceptar las mejoras que sumen valor o rechazar las que distorsionen la idea original.
* **Criterios de Aceptación:**
1. **Aceptación (Merge):** Dentro de un bloque atómico `UnitOfWork`, la API aplica los cambios del delta al objeto principal y marca la propuesta como `APPROVED_BY_AUTHOR`.
2. **Rechazo (Reject):** El objeto principal permanece intacto y la propuesta cambia a `REJECTED_BY_AUTHOR`.
3. Se registra el auditor de la acción (`resolved_by`, `resolved_at`).



---

### 3.4. Agente Extractor (IA)

#### US-07: Estructuración Asíncrona de Texto No Estructurado

* **Como** Agente Extractor (Worker asíncrono),
* **Quiero** consumir textos crudos (actas, reportes, formularios) desde la cola de eventos de Redis Streams,
* **Para** generar borradores de Nodos y Aristas pre-estructurados con la ontología activa.
* **Criterios de Aceptación:**
1. Lee las definiciones activas de la ontología desde la caché de Redis RAM.
2. Genera las entidades asignando el `tenant_id` y `workspace_id` de origen.
3. Deposita los objetos en la base de datos con estado `DRAFT` para revisión humana antes de publicarse en el grafo visible.



---

### 3.5. Agente Relacionador (IA)

#### US-08: Deduplicación Vectorial y Sugerencia de Conexiones

* **Como** Agente Relacionador (Worker asíncrono),
* **Quiero** calcular la similitud vectorial del texto de nuevos Nodos contra el vector de la base de datos (`pgvector`),
* **Para** detectar ideas duplicadas o proponer relaciones complementarias automáticamente.
* **Criterios de Aceptación:**
1. Actualiza el vector embedding (768 dimensiones) en la columna `embedding`.
2. Si la similitud coseno supera el umbral de duplicado ($> 0.92$), crea una propuesta de fusión (`MERGED_INTO`) para revisión del autor.
3. Si detecta complementariedad, crea una Arista en `public.edges` con estado `PROPOSED` y emite un evento de refresco en tiempo real para los usuarios que tengan ese subgrafo en pantalla.



---

### 3.6. Comité / Moderador (Gobernanza Institucional)

#### US-09: Desbloqueo por Inactividad del Autor (Deadlock Handling)

* **Como** Moderador del Sistema,
* **Quiero** evaluar propuestas de edición sobre Nodos cuyos autores han estado inactivos por más de 14 días y cuentan con alto respaldo comunitario,
* **Para** evitar que el conocimiento del grafo quede congelado por abandono del autor original.
* **Criterios de Aceptación:**
1. Un Job programado consulta propuestas en estado `PENDING` con `community_score >= +10` y autor inactivo.
2. El moderador puede ejecutar una aprobación supervisada que aplica los cambios y marca el estado como `AUTO_APPLIED`.



---

## 4. Matriz de Estados de Entidades Principales

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ESTADOS DE NODOS Y ARISTAS                       │
│                                                                         │
│  [DRAFT] ──► (Validación o publicación) ──► [ACTIVE]                    │
│                                                │                        │
│                                                ├─► [ARCHIVED]           │
│                                                └─► [DEPRECATED]         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                   ESTADOS DE PROPUESTAS DE EDICIÓN (PRs)                │
│                                                                         │
│  [PENDING] ──┬──► [APPROVED_BY_AUTHOR] ──► (Cambios aplicados al Nodo)  │
│              ├──► [REJECTED_BY_AUTHOR] ──► (Nodo permanece intacto)     │
│              └──► [AUTO_APPLIED]       ──► (Aplicado por Moderador/IA)  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    ESTADOS DE CLASES ONTOLÓGICAS (META)                 │
│                                                                         │
│  [PROPOSED] ──► (Consenso / Moderación) ──► [ACTIVE]                   │
│                                                │                        │
│                                                └─► [DEPRECATED]         │
└─────────────────────────────────────────────────────────────────────────┘

```

---

## 5. Diagramas de Flujo de Procesos Clave

```
┌─────────────────────────────────────────────────────────────────────────┐
│               PROCESO 1: EDICIÓN COLABORATIVA DE UN NODO                │
│                                                                         │
│ [Usuario B] ──► Crea Propuesta de Edición (public.edit_proposals)      │
│                        │                                                │
│                        ▼                                                │
│       Abre Hilo Social & Notifica al Autor                              │
│                        │                                                │
│                        ▼                                                │
│       Comunidad Vota e Interactúa (+1 / -1)                             │
│                        │                                                │
│         ┌──────────────┴──────────────┐                                 │
│         ▼                             ▼                                 │
│  [Autor Acepta]               [Autor Rechaza]                           │
│  • Transaction UnitOfWork     • Propuesta cambia                        │
│  • Aplica Delta al Nodo         a REJECTED.                             │
│  • Estado: APPROVED           • Nodo no cambia.                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│            PROCESO 2: SINCRONIZACIÓN REACTIVA EN TIEMPO REAL            │
│                                                                         │
│ [Acción de Usuario o IA] ──► Mutación aprobada en Fastify API           │
│                                     │                                   │
│                                     ▼                                   │
│                     Emisión de Evento SSE / WebSockets                  │
│                                     │                                   │
│                                     ▼                                   │
│       PWA evalúa: ¿El nodo modificado está en el subgrafo visible?      │
│         ┌───────────────────────────┴───────────────────────────┐       │
│         ▼                                                       ▼       │
│     [SÍ VISIBLE]                                         [NO VISIBLE]   │
│ Actualiza el nodo en Cytoscape.js                 Muestra indicador     │
│ de forma fluida (Svelte 5 Rune).                 discreto de extensión. │
└─────────────────────────────────────────────────────────────────────────┘


