
# ESPECIFICACIÓN DE CASOS DE USO E HISTORIAS DE USUARIO (VOZLAB)

## 1. Mapeo de Actores del Sistema

| Actor | Descripción | Tipo de Identidad |
| :--- | :--- | :--- |
| **Usuario PWA (Común)** | Estudiante, docente o administrativo de la universidad. Crea nodos, argumenta, propone ediciones y vota. | Pseudónima (`author_hash` ligado a SSO Azure AD). |
| **Mantenedor / Autor** | Usuario que creó un Nodo, Arista o Propuesta de Ontología específico. Actúa como el responsable del "Pull Request". | Pseudónima (Mismo hash creador del elemento). |
| **Comité / Moderador** | Rol institucional supervisado para desbloquear estancamientos o auditar casos de uso de riesgo. | Pseudónima con privilegios elevados (`ROLE_ADMIN`). |
| **Agente Extractor (IA)** | Servicio asíncrono que analiza textos no estructurados y los convierte en borradores de Nodos. | Bot de Sistema (`AGENT_EXTRACTOR`). |
| **Agente Relacionador (IA)** | Servicio asíncrono que calcula embeddings, detecta duplicados y propone Aristas. | Bot de Sistema (`AGENT_RELACIONADOR`). |

---

## 2. Historias de Usuario por Actor

### 2.1. Usuario PWA (Común)

#### US-01: Creación de un Nodo (Idea, Problema, Recurso)
* **Como** Usuario PWA,
* **Quiero** redactar una nueva iniciativa o reporte seleccionando un tipo de la ontología activa,
* **Para** visibilizar un problema o solución en el grafo institucional.
* **Criterios de Aceptación:**
  1. El formulario solicita campos dinámicos definidos en `meta.datatype_properties` para la clase seleccionada.
  2. Al guardar, se registra la tarjeta con su `author_hash` y se asigna el rol de **Mantenedor** al creador sobre este objeto.
  3. Se emite un evento para que el Agente Relacionador procese su embedding de forma asíncrona.

#### US-02: Propuesta de un Nuevo Tipo Ontológico o Atributo
* **Como** Usuario PWA,
* **Quiero** sugerir un nuevo tipo de Nodo, Arista o Atributo que no existe en el catálogo,
* **Para** expandir la capacidad expresiva de la plataforma.
* **Criterios de Aceptación:**
  1. La propuesta se guarda en el esquema `meta` con estado `PROPOSED`.
  2. El usuario puede usar la propuesta inmediatamente en modo borrador local.
  3. Se abre automáticamente un hilo de discusión en `social.discussion_threads`.

#### US-03: Propuesta de Edición sobre Contenido Existente (Pull Request)
* **Como** Usuario PWA,
* **Quiero** proponer una corrección ortográfica o mejora de redacción sobre un Nodo, Arista o Tipo Ontológico ajeno,
* **Para** mejorar la calidad de la información en el sistema.
* **Criterios de Aceptación:**
  1. Se genera un registro en `public.edit_proposals` con los cambios sugeridos (`proposed_changes JSONB`).
  2. Se notifica al Autor/Mantenedor del objeto original.
  3. La propuesta de edición se adjunta al hilo de discusión para recibir votos informativos de respaldo comunitarios.

#### US-04: Votación e Interacción Micro-Gamificada
* **Como** Usuario PWA,
* **Quiero** calificar propuestas de edición, validar relaciones o responder micro-preguntas sobre Nodos,
* **Para** ayudar a filtrar el contenido relevante y ganar reputación/racha.
* **Criterios de Aceptación:**
  1. Cada acción registra una entrada inmutable en `public.interactions_log`.
  2. La base de datos actualiza atómicamente el contador denormalizado (`upvotes`, `downvotes`, `community_score`) en $\mathcal{O}(1)$.
  3. El sistema valida que un usuario solo tenga 1 voto activo por objetivo (`unique_user_target_vote`).

---

### 2.2. Mantenedor / Autor de Objeto

#### US-05: Revisión y Fusión de Propuestas de Edición (Merge / Reject)
* **Como** Autor de un Nodo, Arista o Elemento Ontológico,
* **Quiero** revisar las propuestas de edición que otros usuarios han hecho sobre mi contenido,
* **Para** aceptar las mejoras que sumen valor o rechazar las que distorsionen el sentido.
* **Criterios de Aceptación:**
  1. Al presionar "Aceptar", las modificaciones se aplican al objeto principal y la propuesta pasa a `APPROVED_BY_AUTHOR`.
  2. Al presionar "Rechazar", el objeto principal se mantiene intacto y la propuesta pasa a `REJECTED_BY_AUTHOR`.
  3. Se registra la auditoría con `resolved_by` y `resolved_at`.

---

### 2.3. Agente Extractor (IA)

#### US-06: Procesamiento Asíncrono de Texto No Estructurado
* **Como** Agente Extractor,
* **Quiero** consumir entradas de texto crudo desde la cola de mensajes (SQS) y estructurarlas usando la ontología activa,
* **Para** transformar actas, correos o formularios en borradores de Nodos validados.
* **Criterios de Aceptación:**
  1. Lee la versión compacta de la ontología activa desde la caché (Redis RAM).
  2. Retorna un objeto JSON estructurado acorde a la `system_key` de la clase adecuada.
  3. Deposita el borrador en la base de datos sin publicar directamente en el grafo hasta pasar por validación.

---

### 2.4. Agente Relacionador (IA)

#### US-07: Deduplicación y Conexión Automática del Grafo
* **Como** Agente Relacionador,
* **Quiero** calcular la similitud vectorial de los Nodos recientes contra el grafo existente,
* **Para** identificar ideas duplicadas o proponer aristas entre nodos complementarios.
* **Criterios de Aceptación:**
  1. Genera y actualiza el vector de `768` dimensiones en la columna `embedding`.
  2. Si la similitud coseno es mayor al umbral de duplicado (ej. $>0.92$), propone una fusión (`MERGED_INTO`) para revisión.
  3. Si la similitud sugiere complementariedad, crea una Arista en `public.edges` con estado `PROPOSED`.

---

### 2.5. Comité / Moderador (Gobernanza Institucional)

#### US-08: Desbloqueo por Inactividad de Autor (Deadlock Handling)
* **Como** Moderador del Sistema,
* **Quiero** revisar propuestas de edición en Nodos cuyos autores están inactivos por más de 14 días y cuentan con alto respaldo comunitario,
* **Para** evitar que el grafo quede congelado por abandono.
* **Criterios de Aceptación:**
  1. Un proceso en segundo plano lista propuestas con `status = 'PENDING'`, `community_score >= +10` y autor inactivo.
  2. El moderador puede ejecutar una aprobación supervisada (`status = 'AUTO_APPLIED'`).

---

## 3. Matriz de Procesos y Flujos del Sistema


```

┌─────────────────────────────────────────────────────────────────────────┐
│                          PROCESO 1: CICLO DE VIDA DE NODOS              │
│                                                                         │
│  [Usuario / IA] ──► Crea Nodo (DRAFT/ACTIVE) ──► Asigna Author/Maintainer │
│                                  │                                      │
│                                  ▼                                      │
│                  Agente Relacionador calcula Embedding                  │
│                                  │                                      │
│                ┌─────────────────┴─────────────────┐                    │
│                ▼                                   ▼                    │
│     [Similitud Alta: >0.92]             [Conexión Relevante]            │
│  Sugiére Fusión (MERGED_INTO)          Propone Edge (PROPOSED)          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    PROCESO 2: GOBERNANZA DE EDICIONES (PRs)             │
│                                                                         │
│  [Usuario B] ──► Sugiere Edición ──► Se abre Hilo Social & Notificación │
│                                                │                        │
│                                                ▼                        │
│                                    Comunidad Vota (+1 / -1)             │
│                                                │                        │
│                        ┌───────────────────────┴───────────────────────┐│
│                        ▼                                               ▼│
│               [Autor Acepta]                                   [Autor Rechaza]  │
│  Cambios aplicados al Nodo principal.               Propuesta pasa a REJECTED. │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     PROCESO 3: EVOLUCIÓN DE LA ONTOLOGÍA                │
│                                                                         │
│  [Usuario/IA] ──► Propone Clase/Atributo/Arista (meta.*)                │
│                                  │                                      │
│                                  ▼                                      │
│                 Votación Comunitaria / Evaluación IA                    │
│                                  │                                      │
│                ┌─────────────────┴─────────────────┐                    │
│                ▼                                   ▼                    │
│      [Aprobado: score >= +5]             [Obsoleto / Deprecado]         │
│     Pasa a ACTIVE en Caché.           Inicia proceso de migración       │
│     Habilitado globalmente.           y reemplazo asíncrono.            │
└─────────────────────────────────────────────────────────────────────────┘

```
