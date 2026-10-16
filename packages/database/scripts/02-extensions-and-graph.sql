-- HITO-0.2 / HITO-0.4: per-database extensions and graph bootstrap.
--
-- AGE and pgvector are provided by the custom image (docker/postgres/Dockerfile).
-- This runs once on a fresh volume (docker-entrypoint-initdb.d).
--
--   vozlab_router     -> relational only (uuid via core gen_random_uuid())
--   vozlab_tenant_dev -> AGE (graph) + pgvector (embeddings) + LPG mirror

-- ---------------------------------------------------------------------------
-- Development tenant database: extensions + Apache AGE graph
-- ---------------------------------------------------------------------------
\connect vozlab_tenant_dev

CREATE EXTENSION IF NOT EXISTS "age";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Bootstrap the unified tenant graph and its labels (see docs/modules/01 §4).
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

SELECT ag_catalog.create_graph('vozlab_graph');

SELECT ag_catalog.create_vlabel('vozlab_graph', 'Node');
SELECT ag_catalog.create_elabel('vozlab_graph', 'RELATED_TO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'MERGED_INTO');
SELECT ag_catalog.create_elabel('vozlab_graph', 'CAUSES');
