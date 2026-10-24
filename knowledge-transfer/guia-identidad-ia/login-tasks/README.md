# VozLab — Tareas atómicas de login e identidad

Carpeta autocontenida para modelos pequeños. Cada archivo es un prompt independiente:
el ejecutor solo necesita leer los archivos que nombra cada tarea.

> Documentos rectores: `../01-explicacion-logins-y-ia.md` y `../02-tareas-para-modelo-pequeno.md`.
> Alcance: **solo login, identidad, invitaciones, índice global y auditoría**.
> Fuera de alcance: Extractor/Relator/Consolidador (bloque E y F2 de `02-...`).

## Orden sugerido

1. **A1–A8** en paralelo (decisiones, no código).
2. **B1–B9** laboratorio local.
3. **C1–C8** cierre de riesgos de identidad.
4. **D1–D14** multi-institución e índice global.
5. **F1** ADR-0028 (identidad multi-institución, índice global y broker) y **F4** inventario de datos.

## Índice

### Bloque A — Decisiones
- A1 Sistema de acceso de la universidad
- A2 Broker de identidad
- A3 Índice global: alcance y privacidad
- A6 Ruta del laboratorio de identidad
- A7 Invitaciones y alta directa
- A8 Auditoría

> A4 y A5 (deduplicación y alcance del Extractor) se movieron a `../ai-worker-tasks/`.

### Bloque B — Laboratorio local
- B1 Compose del laboratorio
- B2 Directorio ligero con LLDAP
- B3 Dominio AD de prueba con Samba
- B4 Realm de Keycloak y cliente de VozLab
- B5 Federación del directorio en Keycloak
- B6 Claim `tid` y claims canónicos
- B7 Prueba de humo del laboratorio
- B8 Authentik (opcional)
- B9 SAML 2.0 entre dos realms

### Bloque C — Riesgos de identidad
- C1 Pruebas de contrato del adaptador OIDC
- C2 `email_verified` ausente
- C3 Tabla `auth.external_identities`
- C4 Búsqueda por identidad, no por correo
- C5 El login fija la institución
- C6 Tipo `ExternalIdentity`
- C7 Cerrar sesiones de cuenta desactivada
- C8 HMAC del subject (opcional)

### Bloque D — Multi-institución
- D1 Proveedores por institución en el router
- D2 Ruta de login por institución
- D3 Invitaciones por institución
- D4 Verificación de dominio por DNS
- D5 Prueba de correlación controlada
- D6 Índice global de identidades (M2a)
- D7 Vínculo global ↔ institución (M2b)
- D8 Resolver o crear la identidad global en el login
- D9 Canje de invitación en el primer login
- D10 Gestión de membresías por ADMIN
- D11 Auditoría append-only
- D12 Alta directa de identidades conocidas
- D13 Relleno de usuarios existentes
- D14 Reconciliación router ↔ instituciones

### Bloque F — Gobierno
- F1 ADR-0028
- F4 Inventario de datos personales y aviso de privacidad