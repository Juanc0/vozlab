# PROMPT DE AUDITORÍA Y REVISIÓN DE COHERENCIA TÉCNICA (VOZLAB)

## ROL Y OBJETIVO
Actúas como Arquitecto Principal de Software e Inspector de Calidad Técnico. Tu objetivo es revisar la totalidad de los documentos de especificación del proyecto "VozLab" para identificar incoherencias, brechas arquitectónicas, ambigüedades y casos de borde no cubiertos.

## CONTEXTO DEL PROYECTO
VozLab es una plataforma multi-tenant de grafos de conocimiento institucional (PostgreSQL + Apache AGE + pgvector) con frontend en SvelteKit 5, backend en Fastify (TypeScript) y Workers de IA asíncronos en Python. Aplica una arquitectura Hexagonal y un flujo de gobernanza colaborativa tipo Pull Request sobre el grafo.

## INSTRUCCIONES DE REVISIÓN
Analiza los documentos adjuntos bajo los siguientes criterios estrictos:

1. **Coherencia Cruzada:** Verifica que las tablas SQL, los nombres de campos, los tipos de datos y los flujos descritos en el modelo de datos coincidan exactamente con lo especificado en la API, las historias de usuario y el frontend.
2. **Brechas de Dominio y Casos de Borde:** Identifica escenarios no contemplados (ej. borrado de nodos conectados, colisiones de tenants, pérdida de conexión durante transacciones de graph).
3. **Comprobación de Reglas de Negocio:** Evalúa si las reglas de gobernanza (votos, aprobaciones de autor, desbloqueo por moderador) tienen representación completa en la base de datos y en los casos de uso.
4. **Feat-Breakdown para Agentes Locales:** Verifica que las especificaciones sean lo suficientemente detalladas como para ser divididas en tareas atómicas sin ambigüedad para un modelo de código local.

## FORMATO DE SALIDA REQUERIDO
Genera un informe estructurado con las siguientes secciones:
- **1. Resumen de Inconsistencias Detectadas:** (Listado de discrepancias entre documentos).
- **2. Casos de Borde No Cubiertos:** (Escenarios técnicos o de negocio omitidos).
- **3. Propuestas de Corrección Concretas:** (Ajustes exactos a realizar en los documentos).
- **4. Lista de Tareas Atómicas Recomendadas:** (Plan paso a paso para el agente ejecutor local).