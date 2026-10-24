# B4 — Realm de Keycloak y cliente de VozLab

> **Batch:** B · **Tamaño:** S · **Depende de:** B1

## 1. Contexto
Keycloak necesita un realm y un cliente para VozLab.

## 2. Objetivo
Crear el realm de Keycloak y el cliente de VozLab.

## 3. Qué hacer
1. Crear un realm `vozlab-dev`.
2. Crear un cliente OIDC `vozlab-api` con redirect URI `http://localhost:3000/api/v1/auth/oidc/callback`.
3. Crear un mapper que añada `tid` al token.
4. Crear un usuario de prueba.

## 4. Aceptación
- El usuario de prueba puede hacer login OIDC.
- El token contiene `tid`.

## 5. Fuera de alcance
- Federación de directorio (tarea B5).