# B8 — Authentik: OIDC + SAML + LDAP en una sola herramienta (opcional)

> **Batch:** B · **Tamaño:** M · **Depende de:** A6

## 1. Contexto
Authentik es una alternativa que cubre OIDC, SAML y LDAP outpost en una sola herramienta.

## 2. Objetivo
Evaluar Authentik como laboratorio único para los tres protocolos.

## 3. Qué hacer
1. Crear `docker/identity-lab/authentik/compose.yml` con `authentik-server`, `authentik-worker`, PostgreSQL y Redis.
2. Publicar la interfaz solo en `127.0.0.1:9000`.
3. Crear un usuario de prueba, una aplicación OIDC y una aplicación SAML.
4. Comprobar el LDAP outpost con `ldapsearch`.

## 4. Aceptación
- Un login OIDC y uno SAML terminan en una aplicación de prueba.
- `ldapsearch` devuelve el usuario.

## 5. Fuera de alcance
- Sustituir el laboratorio de Keycloak.