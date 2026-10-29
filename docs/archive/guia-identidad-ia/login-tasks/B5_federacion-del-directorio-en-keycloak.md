# B5 — Federación del directorio en Keycloak

> **Batch:** B · **Tamaño:** S · **Depende de:** B2 o B3, B4

## 1. Contexto
Keycloak puede federar un directorio LDAP externo.

## 2. Objetivo
Federar el directorio (LLDAP o Samba) en Keycloak en modo solo lectura.

## 3. Qué hacer
1. Añadir un proveedor LDAP en Keycloak.
2. Configurar el modo solo lectura.
3. Mapear `uid` a `username` y `mail` a `email`.
4. Probar el login con un usuario del directorio.

## 4. Aceptación
- Un usuario del directorio puede hacer login en Keycloak.

## 5. Fuera de alcance
- Claim `tid` (tarea B6).