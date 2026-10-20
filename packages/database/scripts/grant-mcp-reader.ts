/**
 * DEV-ONLY DATABASE ROLE FOR THE READ-ONLY POSTGRES MCP SERVER.
 *
 * Why this exists
 * ---------------
 * The `postgres` MCP server runs `--access-mode=restricted`, but that
 * restriction is enforced by the server's own SQL validator. A validator is a
 * promise; a database privilege is a fact. This script provisions a role whose
 * only capability is `SELECT`, so the guarantee survives a bypass of the
 * validator:
 *
 *   - `default_transaction_read_only = on`  -> the session cannot write at all
 *   - no `INSERT`/`UPDATE`/`DELETE` grants   -> nothing to escalate to
 *   - no `CONNECT` on the router database     -> the tenant connection
 *                                               passwords stay unreachable
 *
 * It is a *dev tooling* script, not part of the application. It is never run
 * by the API, by `db:migrate`, or in CI.
 *
 * Usage
 * -----
 *   pnpm --filter @vozlab/database db:grant-mcp-reader
 *
 * The password comes from `MCP_READER_PASSWORD` (default `vozlab_mcp_local`).
 * The script prints the connection URI it provisioned; keep it in sync with
 * `mcp.servers.postgres.environment.DATABASE_URI` in `opencode.json`.
 *
 * See docs/agent-tooling.md.
 */
import { Pool, escapeIdentifier, escapeLiteral } from 'pg';

// ---------------------------------------------------------------------------
// Fixed identifiers — deterministic so the script is safe to re-run.
// ---------------------------------------------------------------------------
const ROLE = 'mcp_reader';
const DEFAULT_PASSWORD = 'vozlab_mcp_local';

/** Application schemas the reader may read. */
const APP_SCHEMAS = ['auth', 'meta', 'public', 'social'] as const;

/**
 * Catalog and migration metadata. `drizzle` holds the applied-migration
 * history and `ag_catalog` the Apache AGE graph/label definitions. Neither
 * carries tenant content, and the MCP's health analysis needs to read them.
 */
const METADATA_SCHEMAS = ['drizzle', 'ag_catalog'] as const;

/**
 * `vozlab_graph` (the Apache AGE mirror) is deliberately NOT granted. It is
 * empty today because AGE mirroring is deferred (ADR-0004); when it lands it
 * will duplicate `public.nodes` and `public.edges`, which the reader can
 * already read. Add it here with the mirroring work.
 */

/**
 * Tables the reader must NOT see. Hashed refresh tokens have no API surface
 * that exposes them, so a read-only analytical role has no business reading
 * them.
 */
const DENIED_TABLES = ['auth.refresh_tokens'] as const;

/** Every schema the reader gets USAGE on. */
const READABLE_SCHEMAS = [...APP_SCHEMAS, ...METADATA_SCHEMAS] as const;

// ---------------------------------------------------------------------------
// Connection config — same defaults as the drizzle configs.
// ---------------------------------------------------------------------------
const num = (value: string | undefined, fallback: number) =>
  value === undefined ? fallback : Number(value);

const routerConfig = {
  host: process.env.ROUTER_DB_HOST ?? 'localhost',
  port: num(process.env.ROUTER_DB_PORT, 5432),
  user: process.env.ROUTER_DB_USER ?? 'postgres',
  password: process.env.ROUTER_DB_PASSWORD ?? 'postgres',
  database: process.env.ROUTER_DB_NAME ?? 'vozlab_router',
};

const tenantConfig = {
  host: process.env.TENANT_DB_HOST ?? 'localhost',
  port: num(process.env.TENANT_DB_PORT, 5432),
  user: process.env.TENANT_DB_USER ?? 'postgres',
  password: process.env.TENANT_DB_PASSWORD ?? 'postgres',
  database: process.env.TENANT_DB_NAME ?? 'vozlab_tenant_dev',
};

const readerPassword = process.env.MCP_READER_PASSWORD ?? DEFAULT_PASSWORD;

/** `schemaname.tablename` -> the schemas that actually exist. */
async function existingSchemas(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name = ANY($1::text[])`,
    [READABLE_SCHEMAS as unknown as string[]],
  );
  return new Set(rows.map((r) => r.schema_name));
}

async function grant(): Promise<void> {
  const pool = new Pool(tenantConfig);
  try {
    await pool.query('SELECT 1');

    // --- 0. The database must be migrated before it can be read ------------
    const schemas = await existingSchemas(pool);
    if (schemas.size === 0) {
      throw new Error(
        `No application schema found in "${tenantConfig.database}". ` +
          'Run `pnpm --filter @vozlab/database db:migrate` first.',
      );
    }
    const missing = READABLE_SCHEMAS.filter((s) => !schemas.has(s));
    if (missing.length > 0) {
      throw new Error(
        `Missing schema(s) ${missing.join(', ')} in "${tenantConfig.database}". ` +
          'Run `pnpm --filter @vozlab/database db:migrate:tenant` first.',
      );
    }

    const role = escapeIdentifier(ROLE);
    const passwordLiteral = escapeLiteral(readerPassword);

    // --- 1. The role itself (idempotent) ---------------------------------
    // `CREATE ROLE ... PASSWORD` does not accept a bind parameter, so the
    // password is injected as a properly escaped literal.
    const { rowCount: roleExists } = await pool.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [ROLE],
    );
    if (roleExists === 0) {
      await pool.query(
        `CREATE ROLE ${role} LOGIN PASSWORD ${passwordLiteral}`,
      );
    } else {
      await pool.query(
        `ALTER ROLE ${role} LOGIN PASSWORD ${passwordLiteral}`,
      );
    }

    // --- 2. The database-enforced read-only guarantee ---------------------
    await pool.query(
      `ALTER ROLE ${role} SET default_transaction_read_only = on`,
    );
    await pool.query(
      `ALTER ROLE ${role} SET statement_timeout = '30s'`,
    );
    await pool.query(
      `ALTER ROLE ${role} SET idle_in_transaction_session_timeout = '60s'`,
    );

    // --- 3. Database CONNECT ---------------------------------------------
    // The router database holds `tenant_connections.password` in clear text.
    // Deny CONNECT to PUBLIC there, and do NOT grant it to the reader: the
    // reader must not be able to open the router database at all.
    const routerDb = escapeIdentifier(routerConfig.database);
    await pool.query(
      `REVOKE CONNECT ON DATABASE ${routerDb} FROM PUBLIC`,
    );
    await pool.query(
      `REVOKE CONNECT ON DATABASE ${routerDb} FROM ${role}`,
    );

    // Deny-by-default on the tenant database as well: revoke the inherited
    // PUBLIC privilege, then grant the reader explicitly.
    const tenantDb = escapeIdentifier(tenantConfig.database);
    await pool.query(
      `REVOKE CONNECT ON DATABASE ${tenantDb} FROM PUBLIC`,
    );
    await pool.query(
      `GRANT CONNECT ON DATABASE ${tenantDb} TO ${role}`,
    );

    // --- 4. Schema usage, never CREATE -----------------------------------
    const schemaList = READABLE_SCHEMAS.map(escapeIdentifier).join(', ');
    await pool.query(
      `GRANT USAGE ON SCHEMA ${schemaList} TO ${role}`,
    );
    await pool.query(
      `REVOKE CREATE ON SCHEMA ${schemaList} FROM ${role}`,
    );

    // --- 5. SELECT only ---------------------------------------------------
    await pool.query(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaList} TO ${role}`,
    );
    await pool.query(
      `GRANT SELECT ON ALL SEQUENCES IN SCHEMA ${schemaList} TO ${role}`,
    );
    // Tables created by a later migration are readable too: the migrations
    // run as the same role that owns the tables.
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaList} ` +
        `GRANT SELECT ON TABLES TO ${role}`,
    );

    // --- 6. The exceptions -------------------------------------------------
    for (const table of DENIED_TABLES) {
      const [schema, name] = table.split('.') as [string, string];
      await pool.query(
        `REVOKE SELECT ON TABLE ${escapeIdentifier(schema)}.${escapeIdentifier(name)} FROM ${role}`,
      );
    }

    // --- 7. Self-test: prove the guarantee instead of asserting it --------
    const readerPool = new Pool({
      ...tenantConfig,
      user: ROLE,
      password: readerPassword,
    });
    try {
      try {
        const read = await readerPool.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM public.nodes',
        );
        console.log(
          `  read check     SELECT on public.nodes -> ${read.rows[0]?.n ?? 0} row(s)`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `The reader role cannot read public.nodes: ${message}. ` +
            'The MCP would be useless.',
        );
      }

      // The MCP's health analysis walks the migration history and the AGE
      // catalog. If the reader cannot see them, `analyze_db_health` breaks.
      try {
        const meta = await readerPool.query<{ migrations: number; graphs: number }>(
          `SELECT
             (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
             (SELECT count(*)::int FROM ag_catalog.ag_graph)        AS graphs`,
        );
        console.log(
          `  meta check     ${meta.rows[0]?.migrations ?? 0} migration(s), ` +
            `${meta.rows[0]?.graphs ?? 0} AGE graph(s) readable`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `The reader role cannot read the catalog schemas: ${message}. ` +
            'The MCP health analysis would break.',
        );
      }

      try {
        await readerPool.query(
          `INSERT INTO public.nodes (id, type_key, title, status, created_at, updated_at)
           VALUES (gen_random_uuid(), 'Problem', 'mcp write probe', 'PENDING', now(), now())`,
        );
        throw new Error(
          'The reader role was able to INSERT. The read-only guarantee is broken.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('read-only')) {
          console.log(
            '  write check    INSERT rejected by PostgreSQL (read-only transaction)',
          );
        } else {
          throw error;
        }
      }

      try {
        await readerPool.query(
          'SELECT count(*)::int AS n FROM auth.refresh_tokens',
        );
        throw new Error(
          'The reader role was able to read auth.refresh_tokens. The grant is too wide.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('permission denied')) {
          console.log(
            '  deny check     auth.refresh_tokens -> permission denied (as designed)',
          );
        } else {
          throw error;
        }
      }

      // The router database holds the tenant connection passwords. The
      // reader must not be able to open it at all.
      const routerReaderPool = new Pool({
        ...routerConfig,
        user: ROLE,
        password: readerPassword,
      });
      try {
        await routerReaderPool.query('SELECT 1');
        throw new Error(
          'The reader role was able to connect to the router database.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('permission denied')) throw error;
        console.log(
          '  scope check    router database -> CONNECT refused (as designed)',
        );
      } finally {
        await routerReaderPool.end();
      }
    } finally {
      await readerPool.end();
    }

    // --- 8. Report ---------------------------------------------------------
    const uri =
      `postgresql://${ROLE}:${readerPassword}` +
      `@host.docker.internal:${tenantConfig.port}/${tenantConfig.database}`;

    console.log('\n✓ Postgres MCP reader role provisioned');
    console.log(`  role             ${ROLE}`);
    console.log(`  database         ${tenantConfig.database}`);
    console.log(`  schemas          ${READABLE_SCHEMAS.join(', ')}`);
    console.log(`  read-only        default_transaction_read_only = on`);
    console.log(`  denied           ${DENIED_TABLES.join(', ')}`);
    console.log(`  router db        CONNECT revoked from PUBLIC`);
    console.log('\nConnection URI for opencode.json:');
    console.log(`  ${uri}`);
    console.log(
      '\nKeep it in sync with mcp.servers.postgres.environment.DATABASE_URI.',
    );
  } finally {
    await pool.end();
  }
}

grant()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Could not provision the MCP reader role:', message);
    console.error(
      '\nIs Postgres running and migrated? Try:\n' +
        '  docker compose up -d\n' +
        '  pnpm --filter @vozlab/database db:migrate\n',
    );
    process.exit(1);
  });
