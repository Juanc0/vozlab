import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as routerSchema from './schema/router.schema.js';

/**
 * Factory that creates a Drizzle client bound to the global router database
 * (`vozlab_router`). The router DB holds the tenant registry and physical
 * connection configs — it is the single source of truth for multi-tenant
 * resolution.
 */
export function createRouterDrizzle(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
}) {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max ?? 10,
  });

  return { db: drizzle(pool, { schema: routerSchema }), pool };
}