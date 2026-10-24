# VozLab identity lab

Laboratorio local para probar login, tokens, roles y aislamiento entre instituciones.

## Levantar

```bash
docker compose -f docker/identity-lab/compose.yml up -d
```

## Acceso

- Keycloak: http://127.0.0.1:8080 (admin/admin, solo dev)
- Redis: 127.0.0.1:6379

## Notas

- `start-dev` es solo para laboratorio, no para producción.
- No se guardan secretos en el repositorio.