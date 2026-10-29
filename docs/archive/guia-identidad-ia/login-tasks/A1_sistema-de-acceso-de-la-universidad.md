# A1 — Sistema de acceso de la universidad

> **Tipo:** decisión (no es código) · **Tamaño:** S · **Depende de:** nada · **Estado:** `[x]` (resuelto)

## 1. Contexto
No sabemos qué proveedor usa la universidad ni qué atributos entrega. Sin esa información no se puede configurar el broker ni el mapper de institución.

## 2. Objetivo
Obtener las respuestas de TI y guardarlas sin datos personales.

## 3. Respuesta registrada
- Método de acceso: **Microsoft 365 (Entra ID)** (según el usuario).
- Las demás preguntas (RENATA/COLFIRE/eduGAIN, atributos, bajas, MFA, plazo de registro) quedan diferidas; no bloquean el laboratorio ni la implementación inicial.

## 4. Qué hacer
1. Guardar esta respuesta en `knowledge-transfer/guia-identidad-ia/respuestas-ti.md`.
2. Registrar la fecha.

## 4. Preguntas (copiar tal cual)
1. ¿Qué sistema de acceso usan para estudiantes y docentes: Microsoft 365 (Entra ID), Google Workspace, un SSO propio (CAS, Shibboleth), un AD con ADFS, una federación académica?
2. ¿Son miembros de RENATA o COLFIRE, o de eduGAIN? ¿Tienen un IdP SAML disponible para servicios externos?
3. ¿Qué atributos liberan a un servicio nuevo: correo, nombre, identificador no reasignado, afiliación?
4. Si alguien se da de baja, ¿en cuánto tiempo pierde el acceso?
5. ¿Hay MFA obligatorio? ¿Qué método?
6. ¿Pueden registrar a VozLab como aplicación (registro de aplicación o metadatos SAML)? ¿En qué plazo?

## 5. Aceptación
- Cada pregunta tiene respuesta o la marca "no sabe".
- Fecha registrada.

## 6. Fuera de alcance
- Configurar el broker (tarea B4).
- Cambiar código.