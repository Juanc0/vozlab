/**
 * EVENT CODE CREATION — operator CLI (FR-03).
 *
 * Creates a global event code in the router DB (ADR-0019). Only the SHA-256
 * hash is persisted; the raw code is printed once and is the payload of the QR
 * handed to attendees.
 *
 * The target workspace is validated against the tenant's physical database
 * (`auth.workspaces`) before the row is inserted, so a typo cannot produce a
 * code that is guaranteed to fail at join time.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:event-code -- \
 *     --tenant sabana \
 *     --workspace 33333333-3333-4333-8333-333333333333 \
 *     --label "Orientation 2026" \
 *     --days 7 \
 *     --max-uses 200
 *
 * Defaults: `--tenant sabana`, the seeded dev workspace, 7 days, unlimited uses.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  createRouterDrizzle,
  eventCodes,
  tenantConnections,
  tenants,
} from '../src/index.js';
import {
  TENANT_SLUG,
  WORKSPACE_ID,
} from './dev-identities.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const RAW_CODE_PREFIX = 'vle_';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Args {
  tenant: string;
  workspace: string;
  label?: string;
  days: number;
  maxUses?: number;
  createdByHash?: string;
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function usage(): string {
  return [
    'Usage: db:event-code -- [--tenant <slug|uuid>] [--workspace <uuid>]',
    '                       [--label <text>] [--days <n>] [--max-uses <n>]',
    '                       [--created-by <64-hex authorHash>]',
    '',
    'Defaults: --tenant sabana, the seeded dev workspace, 7 days, unlimited uses.',
  ].join('\n');
}

/** Parse `--key value` and `--key=value`; pnpm forwards a leading `--`. */
function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  const known = new Set([
    'tenant',
    'workspace',
    'label',
    'days',
    'max-uses',
    'created-by',
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined || arg === '--') continue;

    if (!arg.startsWith('--')) {
      fail(`Unexpected argument "${arg}".\n\n${usage()}`);
    }

    const body = arg.slice(2);
    const separator = body.indexOf('=');
    const key = separator === -1 ? body : body.slice(0, separator);

    if (!known.has(key)) {
      fail(`Unknown option "--${key}".\n\n${usage()}`);
    }
    if (values.has(key)) {
      fail(`Option "--${key}" was provided twice.`);
    }

    let value: string | undefined;
    if (separator === -1) {
      value = argv[i + 1];
      if (value === undefined || value === '--') {
        fail(`Option "--${key}" requires a value.`);
      }
      i += 1;
    } else {
      value = body.slice(separator + 1);
    }

    values.set(key, value);
  }

  const workspace = values.get('workspace') ?? WORKSPACE_ID;
  if (!UUID_RE.test(workspace)) {
    fail(`--workspace must be a UUID (got "${workspace}").`);
  }

  const days = Number(values.get('days') ?? '7');
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    fail('--days must be an integer between 1 and 365.');
  }

  let maxUses: number | undefined;
  const rawMaxUses = values.get('max-uses');
  if (rawMaxUses !== undefined) {
    maxUses = Number(rawMaxUses);
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      fail('--max-uses must be a positive integer.');
    }
  }

  const createdByHash = values.get('created-by');
  if (createdByHash !== undefined && !HASH_RE.test(createdByHash)) {
    fail('--created-by must be a 64-character hex authorHash.');
  }

  return {
    tenant: values.get('tenant') ?? TENANT_SLUG,
    workspace,
    label: values.get('label'),
    days,
    maxUses,
    createdByHash,
  };
}

function routerConfig() {
  const num = (value: string | undefined, fallback: number): number =>
    value === undefined ? fallback : Number(value);

  return {
    host: process.env.ROUTER_DB_HOST ?? 'localhost',
    port: num(process.env.ROUTER_DB_PORT, 5432),
    user: process.env.ROUTER_DB_USER ?? 'postgres',
    password: process.env.ROUTER_DB_PASSWORD ?? 'postgres',
    database: process.env.ROUTER_DB_NAME ?? 'vozlab_router',
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = createRouterDrizzle(routerConfig());

  try {
    const [tenant] = UUID_RE.test(args.tenant)
      ? await client.db
          .select()
          .from(tenants)
          .where(eq(tenants.id, args.tenant))
          .limit(1)
      : await client.db
          .select()
          .from(tenants)
          .where(eq(tenants.slug, args.tenant))
          .limit(1);

    if (!tenant) {
      fail(`Tenant "${args.tenant}" is not provisioned in the router DB.`);
    }
    if (!tenant.provisioned) {
      fail(`Tenant "${tenant.slug}" is marked as not provisioned.`);
    }

    const [connection] = await client.db
      .select()
      .from(tenantConnections)
      .where(eq(tenantConnections.tenantId, tenant.id))
      .limit(1);

    if (!connection) {
      fail(`Tenant "${tenant.slug}" has no physical connection row.`);
    }

    // Validate the workspace in the tenant DB before writing the global code.
    const tenantPool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
    });
    try {
      const workspace = await tenantPool.query(
        'SELECT 1 FROM auth.workspaces WHERE id = $1',
        [args.workspace]
      );
      if (!workspace.rowCount) {
        fail(
          `Workspace ${args.workspace} does not exist in tenant "${tenant.slug}".`
        );
      }
    } finally {
      await tenantPool.end();
    }

    const rawCode = `${RAW_CODE_PREFIX}${randomBytes(18).toString('base64url')}`;
    const codeHash = createHash('sha256').update(rawCode).digest('hex');
    const expiresAt = new Date(Date.now() + args.days * DAY_MS);

    const [created] = await client.db
      .insert(eventCodes)
      .values({
        tenantId: tenant.id,
        workspaceId: args.workspace,
        codeHash,
        label: args.label ?? null,
        expiresAt,
        maxUses: args.maxUses ?? null,
        createdByHash: args.createdByHash ?? null,
      })
      .returning({ id: eventCodes.id });

    if (!created) {
      fail('The event code was not persisted.');
    }

    console.log('\n✅ Event code created\n');
    console.log(`  id          ${created.id}`);
    console.log(`  tenant      ${tenant.slug} (${tenant.id})`);
    console.log(`  workspace   ${args.workspace}`);
    if (args.label) console.log(`  label       ${args.label}`);
    console.log(`  expires     ${expiresAt.toISOString()} (${args.days} day(s))`);
    console.log(
      `  max uses    ${args.maxUses === undefined ? 'unlimited' : args.maxUses}`
    );
    console.log(`  code hash   ${codeHash}`);
    console.log('\nRaw code (only shown once — put this in the QR):\n');
    console.log(`  ${rawCode}\n`);
  } finally {
    await client.pool.end();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Event code creation failed:', message, '\n');
    process.exit(1);
  });
