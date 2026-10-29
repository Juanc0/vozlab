# B9 — SAML 2.0 de extremo a extremo entre dos realms

> **Batch:** B · **Tamaño:** M · **Depende de:** B4

## 1. Contexto
Hay que probar SAML 2.0 entre dos realms de Keycloak.

## 2. Objetivo
Verificar SAML 2.0 de extremo a extremo.

## 3. Qué hacer
1. Crear un segundo realm `vozlab-idp` con un usuario.
2. Configurar un cliente SAML en el realm IdP.
3. Configurar un proveedor de identidad SAML en el realm SP.
4. Hacer login desde el realm SP usando el IdP.

## 4. Aceptación
- El login SAML termina en el realm SP.
- El token contiene los atributos esperados.

## 5. Fuera de alcance
- Federación con universidades reales.