-- Hito 0.2: Inicialización de Extensiones de Base de Datos
-- Habilita Apache AGE para consultas de grafos sobre SQL
CREATE EXTENSION IF NOT EXISTS "age";

-- Habilita pgvector para almacenamiento y búsqueda de embeddings de IA
CREATE EXTENSION IF NOT EXISTS "vector";