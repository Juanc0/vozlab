# A6 — Ruta del laboratorio de identidad

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada · **Estado:** `[x]` (resuelto)

## 1. Contexto
Hay que elegir el laboratorio local: Keycloak + LLDAP, Authentik, Samba o mock.

## 2. Objetivo
Elegir la ruta del laboratorio de identidad y el tiempo disponible.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, secciones 9.2 y 9.3.

## 4. Decisión tomada
Keycloak + LLDAP para el laboratorio; Authentik como alternativa de una sola herramienta.

## 5. Qué hacer
1. Asignar tiempo.
2. Recordar: LLDAP no es un IdP OIDC/SAML; si se elige, va con Keycloak. mock-oauth2-server es solo OIDC y va en CI.

## 5. Aceptación
- Decisión escrita y tiempo asignado.

## 6. Fuera de alcance
- Instalar el laboratorio (bloque B).