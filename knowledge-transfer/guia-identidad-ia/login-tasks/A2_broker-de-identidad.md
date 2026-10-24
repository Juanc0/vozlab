# A2 — Broker de identidad

> **Tipo:** decisión · **Tamaño:** S · **Depende de:** nada · **Estado:** `[x]` (resuelto)

## 1. Contexto
El broker normaliza todos los proveedores a un formato único. Hay que decidir si es Keycloak autoalojado, Zitadel, Authentik, un SaaS o un módulo dentro de la API.

## 2. Objetivo
Decidir el broker y anotar la decisión en el borrador del ADR de F1.

## 3. Leer primero
- `../01-explicacion-logins-y-ia.md`, secciones 8.3 a 8.5.

## 4. Decisión tomada
**Keycloak autoalojado fuera de la API.** Un módulo OIDC dentro de la API solo si no hay SAML ni LDAP.

## 5. Qué hacer
1. Anotar la decisión en el borrador del ADR de F1, con fecha y responsable.

## 6. Aceptación
- Decisión escrita, con fecha y responsable.

## 7. Fuera de alcance
- Instalar el broker (tarea B1/B4).