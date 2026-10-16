-- HITO-0.4: physical databases for the two-tier multi-tenant design.
--
--   vozlab_router     -> global registry: tenants + tenant_connections
--   vozlab_tenant_dev -> a development tenant DB (auth/meta/public schemas)
--
-- Migrations are applied per-database with drizzle-kit:
--   pnpm --filter @vozlab/database db:migrate:router
--   pnpm --filter @vozlab/database db:migrate:tenant
--
-- NOTE: the per-tenant `nodes.embedding` column is `vector(768)`, so the
-- tenant database needs the `pgvector` extension, and graph traversal needs
-- `age`. Both must be provided by the Postgres image (see HITO-0.2) and
-- enabled inside each database before applying the tenant migrations.

CREATE DATABASE vozlab_router;
CREATE DATABASE vozlab_tenant_dev;
