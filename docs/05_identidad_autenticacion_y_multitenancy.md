# ESPECIFICACIÓN TÉCNICA: IDENTIDAD, AUTENTICACIÓN Y MULTI-TENANCY (VOZLAB)

## 1. Estrategia de Autenticación Delegada (Zero-Local Password)

VozLab delega el 100% de la gestión de contraseñas y factores de autenticación (MFA) en Proveedores de Identidad externos (IdPs).

### 1.1. Proveedores Soportados
* **Usuarios Institucionales (Estudiantes, Docentes, Administrativos):** Autenticación mediante **OpenID Connect (OIDC) / SAML 2.0** contra Microsoft Entra ID (Azure AD) o Google Workspace.
* **Colaboradores Externos:** Autenticación mediante **Google OAuth2**.
* **Usuarios Anónimos de Eventos:** Autenticación efímera basada en código de evento (`event_code`) y huella digital firmada del dispositivo (`device_fingerprint_token`).

### 1.2. Mapeo Estricto de Tenant por OIDC Tenant ID (`tid`)
La resolución del Tenant se realiza de forma estricta y segura mediante las *claims* del JWT emitido por el IdP:
1. **Verificación Directa por `tid` / `iss`:** La API extrae el `tid` (Tenant ID) o el `iss` (Issuer URL) del token JWT firmado criptográficamente.
2. **Validación contra Tabla de Tenants Aprovisionados:** Si el `tid` existe en la base de datos de Tenants (registrado previamente de forma manual por un `SUPER_ADMIN`), la petición se enruta a la instancia correspondiente.
3. **Rechazo / PENDING_APPROVAL:** Si el `tid` no está aprovisionado en la plataforma, el usuario es bloqueado o puesto en estado de revisión. No existe auto-descubrimiento automático por dominio de correo.

---

## 2. Experiencia de Usuario: URL Limpia y Selector de Workspaces

### 2.1. Navegación por Dominio Unificado (`app.vozlab.io`)
La aplicación no expone slugs ni IDs de Tenants o Workspaces en la barra de direcciones del navegador:
* URL Base: `https://app.vozlab.io/`
* Módulos: `https://app.vozlab.io/discussions`, `https://app.vozlab.io/proposals`

### 2.2. Gestión de Contexto de Workspace
* El Workspace activo se almacena en una **Cookie HTTP-Only Segura** y en el `sessionStorage` del navegador.
* La interfaz PWA (SvelteKit 5) incluye un **Selector de Espacios de Trabajo (estilo Obsidian Vaults / Slack)** en el perfil/panel lateral.
* Cambiar de Workspace actualiza la cookie y conmuta la reactividad del estado global (`$state()`) para renderizar el nuevo grafo sin recargar la página.

---

## 3. Eventos y Presentaciones Interactivas (QR Code & Anónimos)

1. **Creación de Sesión de Evento:** Un usuario autorizado genera una sesión de evento asociada a un Workspace con un `event_code` de expiración configurable (ej. 3 horas).
2. **Acceso por QR:** Los asistentes escanean el QR e ingresan a `https://app.vozlab.io/join?code={event_code}`.
3. **Persistencia del Seudónimo:** El backend asigna un seudónimo único (ej. `Nave-Explorer-84`) y almacena un token firmado en el `LocalStorage` del navegador.
4. **Expiración de la Ventana:**
   * Vencido el horario del `event_code`, el enlace impide la creación de **nuevos** usuarios anónimos.
   * **Los usuarios anónimos ya registrados mantienen acceso indefinido** a sus cuentas para seguir interactuando con sus aportes dentro del Workspace.

---

## 4. Multi-Tenancy B2B y Aislamiento por Base de Datos

### 4.1. Modelo Database-per-Tenant
Cada institución/cliente B2B opera en su propia instancia física o lógica de PostgreSQL (`vozlab_sabana_db`, `vozlab_cliente2_db`).

### 4.2. Workspaces por Instancia
Dentro de la base de datos de un Tenant, los contenidos se segmentan mediante la columna `workspace_id`. Los administradores pueden configurar la visibilidad (`is_public`) y la ontología propia de cada Workspace.