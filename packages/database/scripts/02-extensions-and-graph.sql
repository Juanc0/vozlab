-- HITO-0.2 / HITO-0.4: per-database extensions bootstrap.
--
-- pgvector is provided by the custom image (docker/postgres/Dockerfile).
-- Apache AGE was removed per ADR-0027 (not used by code).
-- This runs once on a fresh volume (docker-entrypoint-initdb.d).
--
--   vozlab_router     -> relational only (uuid via core gen_random_uuid())
--   vozlab_tenant_dev -> pgvector (embeddings)

-- ---------------------------------------------------------------------------
-- Development tenant database: extensions
-- ---------------------------------------------------------------------------
\connect vozlab_tenant_dev

CREATE EXTENSION IF NOT EXISTS "vector";