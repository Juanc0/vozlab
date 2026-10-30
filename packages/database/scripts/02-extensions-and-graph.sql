-- HITO-0.2 / HITO-0.4: per-database extensions bootstrap.
--
-- AGE and pgvector are provided by the custom image (docker/postgres/Dockerfile).
-- This runs once on a fresh volume (docker-entrypoint-initdb.d).
--
--   vozlab_router     -> relational only (uuid via core gen_random_uuid())
--   vozlab_tenant_dev -> AGE + pgvector (embeddings)

-- ---------------------------------------------------------------------------
-- Development tenant database: extensions
-- ---------------------------------------------------------------------------
\connect vozlab_tenant_dev

CREATE EXTENSION IF NOT EXISTS "age";
CREATE EXTENSION IF NOT EXISTS "vector";

-- The AGE graph is created on demand when the AGE adapter lands (ADR-0004).
