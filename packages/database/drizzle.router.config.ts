import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the GLOBAL ROUTER database (`vozlab_router`).
 *
 * This database holds ONLY the tenant registry and its physical connection
 * configs. It is intentionally isolated from the per-tenant schemas
 * (`auth`, `meta`, `public`) — see the two-tier multi-tenant design.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:generate:router
 *   pnpm --filter @vozlab/database db:migrate:router
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/router.schema.ts',
  out: './migrations/router',
  dbCredentials: {
    host: process.env.ROUTER_DB_HOST ?? 'localhost',
    port: Number(process.env.ROUTER_DB_PORT ?? 5432),
    user: process.env.ROUTER_DB_USER ?? 'postgres',
    password: process.env.ROUTER_DB_PASSWORD ?? 'postgres',
    database: process.env.ROUTER_DB_NAME ?? 'vozlab_router',
  },
});
