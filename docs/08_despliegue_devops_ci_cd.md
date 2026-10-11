# ESPECIFICACIÓN DE DESPLIEGUE, INFRAESTRUCTURA Y CI/CD (VOZLAB)

## 1. Estrategia de Containerización y Multi-stage Builds

El backend TypeScript de VozLab se empaqueta utilizando Docker con un enfoque de **Multi-stage Build** para garantizar imágenes ultra ligeras, sin código fuente expuesto y con una superficie de ataque mínima.

### 1.1. Topología de Servicios
Para garantizar que el procesamiento pesado de Inteligencia Artificial no afecte la velocidad de respuesta de la API web, la misma imagen base de Docker se ejecuta en dos contenedores independientes:

1. **`api`:** Atiende peticiones HTTP/REST y WebSockets desde la PWA (SvelteKit).
   * Comando: `node dist/infrastructure/http/server.js`
2. **`worker-ia`:** Consumidor asíncrono que procesa eventos de Redis Streams (embeddings vectoriales, deduplicación de grafos y extracción de textos).
   * Comando: `node dist/infrastructure/events/worker.js`

### 1.2. Entorno de Desarrollo Local (`docker-compose.yml`)
En máquinas de desarrollo, las dependencias de persistencia se levantan con un solo comando (`docker compose up`):
* **PostgreSQL:** Con extensiones **Apache AGE** (Grafo LPG) y **pgvector** (Búsqueda semántica de 768 dimensiones).
* **Redis:** Instancia en memoria para Broker de Eventos (Streams) y Caché de Ontologías.

---

## 2. Estrategia de Migraciones de Base de Datos Multi-Tenant

### 2.1. Gestión de Esquemas Híbridos (Drizzle-Kit + Apache AGE)
* **Tablas SQL (`auth`, `meta`, `public`, `social`):** Se gestionan mediante archivos de migración SQL ordenados cronológicamente creados por `drizzle-kit`.
* **Grafo LPG (Apache AGE):** Las etiquetas y estructuras del grafo se modifican mediante comandos SQL nativos de AGE (`ag_catalog.create_vlabel`) embebidos dentro de las migraciones de Drizzle.

### 2.2. Ejecución Segura de Migraciones en Producción
Para evitar condiciones de carrera o bloqueos de tablas (*table locks*) en entornos con múltiples contenedores API activos:
* Las migraciones en producción no se ejecutan al iniciar el servidor HTTP.
* Se ejecutan mediante un **Job / Contenedor Efímero Aislado** previo al despliegue de la API. Si la migración falla, el pipeline aborta automáticamente el despliegue para proteger la integridad de los datos.

### 2.3. Sembrado de Datos Iniciales (Database Seeding)
El sistema incluye el script `npm run db:seed` para poblar entornos de prueba y desarrollo con la ontología base, tenants iniciales y un usuario administrador.

---

## 3. Pipeline de CI/CD (GitHub Actions)

El ciclo de integración y despliegue continuo se automatiza mediante **GitHub Actions**.

### 3.1. Pipeline de Integración Continua (CI)
En cada Pull Request hacia la rama `main`, se ejecutan en paralelo los siguientes pasos de validación:
1. **Lint Check:** Validación de sintaxis y reglas con ESLint.
2. **Type Check:** Verificación de tipos estáticos con TypeScript (`tsc --noEmit`).
3. **Unit Tests:** Ejecución de pruebas unitarias ultra rápidas con **Vitest** e In-Memory Repositories.
4. **Integration Tests:** Ejecución de pruebas de integración usando contenedores efímeros de PostgreSQL con Apache AGE en GitHub Actions.
5. **Container Build:** Verificación de compilación limpia de la imagen Docker.

### 3.2. Pipeline de Despliegue Continuo (CD)
1. **Frontend PWA (SvelteKit 5):** Se despliega automáticamente en la infraestructura Serverless de Vercel / Cloudflare Pages.
2. **Backend Services (Fastify API + Worker IA):** Una vez superadas las pruebas y ejecutadas las migraciones de base de datos, se actualizan los contenedores en el entorno de Staging o Producción.

---

## 4. Gestión de Secretos y Seguridad de Entorno

* **Cero Secretos en Código Fuente:** Ninguna contraseña, llave privada o cadena de conexión se guarda en el repositorio Git ni en archivos `.env` de producción.
* **GitHub Secrets:** Las variables sensibles (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, credenciales OIDC) se almacenan de forma encriptada en el panel de secretos del repositorio y se inyectan como variables de entorno seguras en el tiempo de ejecución de los contenedores.