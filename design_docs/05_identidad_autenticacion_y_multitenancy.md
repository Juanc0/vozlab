# ESPECIFICACIÓN TÉCNICA: IDENTIDAD, AUTENTICACIÓN Y MULTI-TENANCY (VOZLAB)

## 1. Estrategia de Autenticación y Delegación Externa (Zero-Local Password)

VozLab delega el 100% de la gestión de contraseñas y factores de autenticación (MFA) en Proveedores de Identidad externos (IdPs).

### 1.1. Proveedores Soportados
* **Usuarios Institucionales (Estudiantes, Docentes, Administrativos):** Autenticación mediante **OpenID Connect (OIDC) / SAML 2.0** contra Microsoft Entra ID (Azure AD) o Google Workspace.
* **Colaboradores Externos:** Autenticación mediante **Google OAuth2**.
* **Usuarios Anónimos de Eventos:** Autenticación efímera basada en código de evento (`event_code`) y huella digital firmada del dispositivo (`device_fingerprint_token`).

### 1.2. Ciclo de Vida del Usuario Externo
1. El usuario externo se autentica mediante Google OAuth2.
2. El sistema lo registra en `auth.users` con estado `PENDING_APPROVAL`.
3. El usuario visualiza únicamente la pantalla de bienvenida / espera.
4. Un `SUPER_ADMIN` o `WORKSPACE_ADMIN` aprueba la solicitud en el panel de administración, cambiando el estado a `ACTIVE`.

---

## 2. Eventos y Presentaciones Interactivas (QR Code & Anónimos)

1. **Creación de Sesión de Evento:** Un usuario autorizado genera una sesión de evento asociada a un Workspace con un `event_code` de expiración configurable (ej. 3 horas).
2. **Acceso por QR:** Los asistentes escanean el QR e ingresan a `/t/{tenant}/w/{workspace}/join?code={event_code}`.
3. **Persistencia del Seudónimo:** El backend asigna un seudónimo único (ej. `Nave-Explorer-84`) y almacena un token firmado en el `LocalStorage` del navegador.
4. **Expiración de la Ventana:**
   * Vencido el horario del `event_code`, el enlace no permite crear **nuevos** usuarios anónimos.
   * **Los usuarios anónimos ya registrados mantienen acceso indefinido** a sus cuentas y pueden seguir interactuando con sus aportes dentro del Workspace.

---

## 3. Multi-Tenancy y Estructura de Workspaces

### 3.1. Modelo Multi-Tenant por Base de Datos Separada (Database-per-Tenant)
Cada institución/cliente B2B opera en su propia instancia física o lógica de PostgreSQL (`vozlab_sabana_db`, `vozlab_cliente2_db`).

### 3.2. Workspaces por Instancia
Dentro de la base de datos de un Tenant, los contenidos se segmentan mediante la columna `workspace_id`. Los administradores pueden configurar la visibilidad (`is_public`) y la ontología propia de cada Workspace.

### 3.3. Sincronización Ontológica entre Workspaces
* **One-Way (Suscripción):** Un Workspace secundario recibe automáticamente las actualizaciones de la ontología del Workspace principal o Tenant.
* **Two-Way (Pull Request Cross-Workspace):** Un Workspace propone una clase/relación ontológica nueva mediante una propuesta que debe ser aprobada por el administrador del Workspace destino.

---

## 4. Estructura de Rutas y Navegación PWA

La aplicación utiliza un esquema de rutas por **Path unificado** para optimizar el funcionamiento de la PWA y los certificados SSL:

`https://vozlab.unisabana.edu.co/t/{tenant_slug}/w/{workspace_slug}/...`

* `/t/sabana/w/ingenieria/nodes`: Grafo de nodos del workspace de ingeniería.
* `/t/sabana/w/demo-presentaciones`: Workspace de pruebas precargado para presentaciones.