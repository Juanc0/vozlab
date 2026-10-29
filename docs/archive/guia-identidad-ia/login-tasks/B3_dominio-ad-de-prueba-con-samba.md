# B3 — Dominio AD de prueba con Samba

> **Batch:** B · **Tamaño:** M · **Depende de:** B1

## 1. Contexto
Samba AD DC simula un AD real con LDAP, DNS y Kerberos.

## 2. Objetivo
Crear un dominio AD de prueba con Samba.

## 3. Qué hacer
1. Crear `docker/identity-lab/samba/compose.yml` con Samba AD DC.
2. Usar una red Docker propia.
3. Aprovisionar con `samba-tool domain provision` con `--use-rfc2307`.
4. Crear tres usuarios y dos grupos.
5. Comprobar bajas con `userAccountControl`.

## 4. Aceptación
- `ldapsearch` devuelve los usuarios.
- Una cuenta deshabilitada deja de autenticarse.

## 5. Fuera de alcance
- Federación en Keycloak (tarea B5).