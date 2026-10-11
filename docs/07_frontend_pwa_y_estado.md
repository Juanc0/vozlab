
# ESPECIFICACIÓN DEL FRONTEND PWA, ESTADO Y VISUALIZACIÓN DE GRAFOS (VOZLAB)

## 1. Arquitectura de UI y Enrutamiento (SvelteKit 5 + Serverless SSR)

La interfaz de VozLab se construye como una Progressive Web App (PWA) moderna sobre **SvelteKit 5 (Runes)**, desplegada como funciones Serverless en infraestructura global (Vercel / Cloudflare Pages) para lograr una carga inicial inmediata mediante SSR (Server-Side Rendering).

### 1.1. URLs Limpias y Group Layouts (`src/routes/`)
Para mantener URLs 100% pulcritud institucional (`app.vozlab.io/`), la estructura utiliza **Group Layouts** de SvelteKit. Los paréntesis agrupan la lógica de autorización sin alterar la ruta pública del navegador:


```

src/routes/
├── (app)/                           <-- GRUPO AUTENTICADO (Layout con selector de Workspace)
│   ├── +layout.svelte               <-- Carga inicial del perfil y contexto de trabajo
│   ├── +page.svelte                 <-- VISTA PRINCIPAL: Visualizador del Grafo de Conocimiento
│   ├── discussions/
│   │   └── +page.svelte             <-- Hilos de debate y construcción de consensos
│   └── proposals/
│       └── +page.svelte             <-- Propuestas de edición ontológica
│
└── (auth)/                          <-- GRUPO PÚBLICO / AUTENTICACIÓN
├── login/
│   └── +page.svelte             <-- Redirección OIDC / SSO Delegado
└── join/
└── +page.svelte             <-- Registro por código QR / enlace efímero de evento

```

---

## 2. Gestión del Estado Global y Contexto Multi-pestaña

### 2.1. Reactividad con Runes de Svelte 5 (`$state`)
Se elimina el uso de *stores* tradicionales en favor de clases de estado nativas con Runes en archivos `.svelte.ts`:

* **`$state`:** Controla el workspace activo, los nodos seleccionados y los estados de carga.
* **`$derived`:** Computa permisos en tiempo real (`canEdit`, `isModerator`) según el rol del usuario en el espacio activo.

### 2.2. Aislamiento de Workspaces por Pestaña (`sessionStorage`)
* **URL Limpia y Multi-Pestaña:** El identificador del workspace activo (`workspace_id`) se almacena en el **`sessionStorage`** exclusivo de cada pestaña del navegador.
* **Flexibilidad de Investigación:** Un usuario puede mantener abiertas Pestaña 1 ("Facultad de Ingeniería") y Pestaña 2 ("Campus General") de forma simultánea e independiente sin colisiones de estado.
* **Validación Stateless en Backend:** La PWA adjunta el header `X-Workspace-ID` en cada consulta de datos hacia la API Fastify, la cual valida la pertenencia y permisos del usuario en cada petición individual.

---

## 3. Motor de Visualización e Interacción del Grafo

### 3.1. Renderizado en Canvas 2D (Cytoscape.js)
Dado que la aplicación enfoca la atención en subgrafos temáticos organizados ($\approx 100 - 200$ nodos por vista), la visualización utiliza **Cytoscape.js** sobre un elemento Canvas 2D acoplado en el ciclo de vida de Svelte 5 (`$effect`).

### 3.2. Layout Estático y Control de Acomodo Manual
* **Disposición Inicial Determinista:** Los subgrafos se posicionan mediante algoritmos jerárquicos (`dagre`) o concéntricos según el metamodelo de la ontología.
* **Interacción Rápida:** Sin simulaciones de física continua que agoten la batería. Soporta **Drag & Drop** para que el usuario acomode nodos libremente, zoom, pan y selección de subgrafos para apertura de detalles.

---

## 4. Estrategia PWA, Caching y Tiempo Real

### 4.1. Filosofía Online-First y App Shell Caching
* **Caché de Shell (Workbox / Service Workers):** Los componentes estáticos (HTML, JS, Cytoscape, CSS, tipografías) se almacenan en caché para apertura instantánea en escritorio o dispositivos móviles instalados como PWA (`display: standalone`).
* **Datos en Vivo:** Las lecturas y escrituras del grafo son estrictamente **Online-First (`Network-Only`)**. Si se pierde la conexión a internet, la PWA muestra una notificación limpia de estado sin conexión, evitando sincronizaciones complejas de edición offline.

### 4.2. Actualizaciones en Tiempo Real por Subgrafo Enfocado
Mediante conexiones persistentes (SSE / WebSockets) con la API Fastify:
* **Nodos en Pantalla:** Si otro usuario actualiza o vota un nodo presente en la vista activa, la Rune `$state` aplica el cambio con una animación sutil directamente en Cytoscape.js.
* **Nuevas Relaciones Adyacentes:** Si se crean conexiones externas con el subgrafo visible, se despliega una señal discreta sobre el nodo padre para permitir al usuario expandir el nuevo contenido de forma consciente.

