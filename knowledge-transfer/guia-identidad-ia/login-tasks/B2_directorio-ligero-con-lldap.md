# B2 — Directorio ligero con LLDAP

> **Batch:** B · **Tamaño:** S · **Depende de:** B1

## 1. Contexto
LLDAP es un servidor LDAP ligero con interfaz web. No es un IdP OIDC/SAML.

## 2. Objetivo
Crear un directorio LDAP con cinco personas de prueba y tres grupos.

## 3. Qué hacer
1. Crear `docker/identity-lab/lldap/compose.yml` con LLDAP.
2. Publicar la interfaz solo en `127.0.0.1:17170`.
3. Crear cinco usuarios y tres grupos.
4. Comprobar con `ldapsearch` desde la red interna.

## 4. Aceptación
- `ldapsearch` devuelve los cinco usuarios.
- La interfaz web es accesible.

## 5. Fuera de alcance
- Federación en Keycloak (tarea B5).