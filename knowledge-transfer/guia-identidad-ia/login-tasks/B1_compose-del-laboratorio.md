# B1 — Compose del laboratorio

> **Batch:** B · **Tamaño:** M · **Depende de:** A6 · **Estado:** `[x]` (resuelto)

## 1. Contexto
Necesitamos un laboratorio local para probar login, tokens, roles y aislamiento entre instituciones.

## 2. Objetivo
Crear el compose del laboratorio en `docker/identity-lab/` sin tocar el `docker-compose.yml` principal.

## 3. Qué hacer
1. Crear `docker/identity-lab/compose.yml` con Keycloak, PostgreSQL y Redis.
2. Publicar la interfaz solo en `127.0.0.1:8080`.
3. Fijar etiquetas y digests después de verificarlos.
4. Crear `docker/identity-lab/README.md` con puertos y comandos.

## 4. Aceptación
- `docker compose -f docker/identity-lab/compose.yml up` levanta Keycloak.
- La interfaz es accesible en `http://127.0.0.1:8080`.

## 5. Fuera de alcance
- Directorio LDAP (tarea B2/B3).
- Realm y cliente (tarea B4).