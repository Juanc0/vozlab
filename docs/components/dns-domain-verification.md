# D4 — Verificación de dominio por DNS (diseño)

> **STATUS: NOT BUILT — design only** (task D4 of the identity guide; carried from `docs/` root 2026-10-29).

> Diseño documentado. No implementado todavía.

## Problema

Antes de que una institución acepte logins con `@ejemplo.edu`, debe demostrar que controla el dominio `ejemplo.edu`. Sin esto, un atacante podría registrar `@harvard.edu` y hacerse pasar por Harvard.

## Flujo propuesto

1. **Admin de la institución** registra su dominio en VozLab (via D1 `tenant_identity_providers` o una tabla nueva `tenant_domains`).
2. **VozLab genera un token de verificación** (CSPRNG, 32 bytes, base64url) y lo muestra al admin.
3. **Admin crea un registro DNS TXT** en su dominio:
   ```
   _vozlab-verify.ejemplo.edu TXT "vozlab-verify=<token>"
   ```
4. **VozLab verifica** resolviendo el DNS TXT record y comparando el token.
5. Si coincide → el dominio se marca como verificado (`verified: true`).
6. Solo dominios verificados se aceptan para login institucional.

## Tabla propuesta (en router DB)

```sql
CREATE TABLE tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL UNIQUE,
  verification_token VARCHAR(64) NOT NULL,
  verified BOOLEAN DEFAULT false NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Seguridad

- El token se genera con CSPRNG (32 bytes).
- El token se muestra una sola vez (como un secreto).
- La verificación se hace server-side (DNS lookup).
- El dominio se verifica periódicamente (re-verificación cada 30 días).
- Si el registro TXT se elimina, el dominio se marca como no verificado.

## Fuera de alcance (por ahora)

- Implementación del código.
- UI para el admin.
- Re-verificación automática.

## Referencias

- ADR-0028 (multi-institución).
- D1 (proveedores por institución).
- D4 task file.