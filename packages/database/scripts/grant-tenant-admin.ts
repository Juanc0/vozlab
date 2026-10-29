/**
 * GRANT OR REVOKE THE TENANT ADMINISTRATOR ROLE.
 *
 * Why this exists
 * ---------------
 * The first tenant administrator cannot be created from the API: every
 * administration route requires `auth.users.system_role = 'ADMIN'`, so
 * bootstrapping needs an operator with database access. This script is that
 * door — and only that door. It is an operator tool, never wired into the
 * API, `db:migrate` or CI.
 *
 * What it changes
 * ---------------
 * One column of one row: `auth.users.system_role` (`'ADMIN'` or `'USER'`).
 * It does not touch memberships, invitations or the workspace: a tenant
 * administrator manages every workspace **without** being a member of it,
 * which is the point of the role.
 *
 * Usage
 * -----
 *   pnpm --filter @vozlab/database db:grant-tenant-admin -- --email dev-maintainer@example.edu
 *   pnpm --filter @vozlab/database db:grant-tenant-admin -- --as maintainer
 *   pnpm --filter @vozlab/database db:grant-tenant-admin -- --email x@y.z --revoke
 *
 * `--as` resolves one of the fixed dev identities, which is the usual local
 * case. Re-running is a no-op and prints the current state.
 *
 * See docs/ops/runbook-ops.md and ADR-0041.
 */
import { Pool } from 'pg';
import { DEV_IDENTITIES, type DevIdentityName } from './dev-identities.js';

const TENANT_CONFIG = {
  host: process.env.TENANT_DB_HOST ?? 'localhost',
  port: Number(process.env.TENANT_DB_PORT ?? 5432),
  user: process.env.TENANT_DB_USER ?? 'postgres',
  password: process.env.TENANT_DB_PASSWORD ?? 'postgres',
  database: process.env.TENANT_DB_NAME ?? 'vozlab_tenant_dev',
};

interface Options {
  email: string;
  revoke: boolean;
}

function parseArgs(argv: string[]): Options {
  let email: string | undefined;
  let as: string | undefined;
  let revoke = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--revoke') {
      revoke = true;
    } else if (arg === '--email') {
      email = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length);
    } else if (arg === '--as') {
      as = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--as=')) {
      as = arg.slice('--as='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (email === undefined && as !== undefined) {
    if (!(as in DEV_IDENTITIES)) {
      throw new Error(
        `Unknown dev identity "${as}". Known: ${Object.keys(DEV_IDENTITIES).join(', ')}`
      );
    }
    email = DEV_IDENTITIES[as as DevIdentityName].email;
  }

  if (email === undefined || email.trim() === '') {
    throw new Error(
      'Missing --email or --as. Example: --email dev-maintainer@example.edu'
    );
  }

  return { email: email.trim().toLowerCase(), revoke };
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const role = options.revoke ? 'USER' : 'ADMIN';
  const pool = new Pool(TENANT_CONFIG);

  try {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      system_role: string;
    }>(
      `UPDATE auth.users
          SET system_role = $1
        WHERE lower(email) = $2
        RETURNING id, email, system_role`,
      [role, options.email]
    );

    if (rows.length === 0) {
      throw new Error(
        `No user with email "${options.email}" in "${TENANT_CONFIG.database}". ` +
          'The person must sign in once before being made a tenant administrator.'
      );
    }

    for (const row of rows) {
      console.log(
        `  ${row.email} -> ${row.system_role} (auth.users.id ${row.id})`
      );
    }
    console.log(
      `\n✓ Tenant administrator ${options.revoke ? 'revoked' : 'granted'}`
    );
    console.log(`  database         ${TENANT_CONFIG.database}`);
    console.log(
      '\nThe role is read from the database on every request: the change is'
    );
    console.log('effective immediately, no new token needed.');
  } finally {
    await pool.end();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Could not change the tenant administrator role:', message);
    console.error(
      '\nIs Postgres running and migrated? Try:\n' +
        '  docker compose up -d\n' +
        '  pnpm --filter @vozlab/database db:migrate:tenant\n'
    );
    process.exit(1);
  });
