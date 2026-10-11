# PROMPT DE AUDITORÍA Y REVISIÓN DE COHERENCIA TÉCNICA (VOZLAB)

## ROL Y OBJETIVO
Actúas como Arquitecto Principal de Software, Especialista en Ciberseguridad e Inspector de Calidad Técnico de Nivel Senior. Tu objetivo es realizar una auditoría rigurosa y exhaustiva de la totalidad de los documentos de especificación del proyecto "VozLab" para identificar incoherencias cruzadas, brechas arquitectónicas, ambigüedades, fallas de transaccionalidad, riesgos de multi-tenancy y casos de borde críticos no cubiertos antes de pasar a la fase de codificación por agentes locales.

## CONTEXTO DEL PROYECTO
VozLab es una plataforma institucional multi-tenant de grafos de conocimiento. Su arquitectura comprende:
- **Base de Datos:** PostgreSQL con aislamiento físico por institución (orquestado por una DB gestora global y el claim `tid` de Azure AD).
- **Backend:** Fastify (TypeScript) bajo Arquitectura Hexagonal y transacciones atómicas con UnitOfWork.
- **Frontend:** SvelteKit 5 (Runes) con espacios de trabajo aislados por pestaña.
- **Workers de IA:** Procesamiento asíncrono en Python 3.12 mediante colas en Redis Streams, con caché local de entidades raíz y pasarela de webhooks serverless (AWS API Gateway + Lambda).
- **Gobernanza:** Ciclo de vida universal de aprobación (DRAFT -> PENDING -> ACTIVE/REJECTED) aplicable tanto a nodos como a aristas y ontologías, vinculado a hilos de discusión social.

## INSTRUCCIONES DE AUDITORÍA Y REVISIÓN ESTRICTA
Analiza la documentación bajo los siguientes criterios de ingeniería de misión crítica:

1. **Coherencia Cruzada de Datos y Contratos:** 
   - Verifica que las estructuras de las tablas relacionales y los grafos coincidan exactamente con los tipos esperados por los esquemas Zod en TypeScript y los DTOs que consumen los workers de Python.
   - Revisa si el flujo de resolución de tenants (`tid` -> Router DB -> Pool de conexión dinámico) no tiene puntos de interbloqueo (*deadlocks*) o latencias innecesarias bajo alta concurrencia.

2. **Brechas de Dominio, Transaccionalidad y Casos de Borde:** 
   - Identifica escenarios de falla no contemplados (ej: ¿Qué ocurre si un webhook masivo llega mientras se ejecuta una migración de esquema Drizzle en un tenant? ¿Cómo se maneja la pérdida de sincronización entre la caché de Redis y la base de datos PostgreSQL?).
   - Evalúa la integridad referencial cuando un nodo con aristas pendientes de aprobación es modificado o eliminado por un usuario.

3. **Seguridad, PII y Gobernanza:** 
   - Revisa si la sanitización de PII en el Agente Extractor está explícitamente acotada antes de guardar o si existe riesgo de filtración de datos sensibles de estudiantes/profesores hacia los modelos de IA.
   - Comprueba si las reglas de gobernanza y votación comunitaria tienen definidos los umbrales de aprobación automática o si dependen siempre de intervención humana manual.

4. **Viabilidad para Agentes Locales (Atomización):** 
   - Evalúa si las definiciones actuales permiten dividir el trabajo en hitos que un modelo de código local (como Qwen2.5-Coder de 7B) pueda implementar sin perder el contexto global del monorepo.

## FORMATO DE SALIDA REQUERIDO
Genera un informe técnico estructurado exactamente con las siguientes secciones:

- **1. Matriz de Inconsistencias Detectadas:** (Discrepancias críticas o menores encontradas entre la documentación de base de datos, API y workers).
- **2. Casos de Borde y Riesgos de Concurrencia Omitidos:** (Escenarios técnicos, de transaccionalidad multi-tenant o de seguridad no cubiertos).
- **3. Propuestas de Corrección Arquitectónica Concretas:** (Ajustes exactos y parches técnicos que deben aplicarse a la conceptualización actual).
