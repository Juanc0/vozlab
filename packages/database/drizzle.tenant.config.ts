import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for a TENANT database (physical DB per institution).
 *
 * Contains the tenant-scoped schemas:
 *   - auth.*   (workspaces, users, memberships)
 *   - meta.*   (ontology metamodel)
 *   - public.* (nodes, edges, edit_proposals)
 *
 * The glob deliberately excludes `router.schema.ts` so router tables are
 * never mixed into tenant migrations.
 *
 * For `db:migrate`/`db:push`, point TENANT_DB_* to a concrete tenant DB
 * (in dev: `vozlab_tenant_dev`).
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:generate:tenant
 *   pnpm --filter @vozlab/database db:migrate:tenant
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/tenant.*.schema.ts',
  out: './migrations/tenant',
  dbCredentials: {
    host: process.env.TENANT_DB_HOST ?? 'localhost',
    port: Number(process.env.TENANT_DB_PORT ?? 5432),
    user: process.env.TENANT_DB_USER ?? 'postgres',
    password: process.env.TENANT_DB_PASSWORD ?? 'postgres',
    database: process.env.TENANT_DB_NAME ?? 'vozlab_tenant_dev',
    // drizzle-kit 0.31 defaults `ssl` to `{}` (TLS forced) when the key is
    // absent, which breaks the local non-TLS Postgres. Explicitly disable it.
    ssl: false,
  },
});
