/**
 * EVENT CODE CREATION / REVOCATION — operator CLI (FR-03, ADR-0046).
 *
 * The credential itself is a `purpose='EVENT'` row in the tenant's
 * `auth.workspace_join_codes` (DEC-3: one mechanism, two credential
 * classes). The router DB keeps only the thin L0 directory row
 * (`public.credential_routes`) that answers "which tenant owns this hash?"
 * before the tenant is known — routing, never authority (ADR-0046).
 *
 * MINT ordering is tenant-first: the authority row must exist before the
 * directory points at the tenant. A failed route insert leaves a live
 * credential the CLI can re-push (the route upsert is idempotent); it
 * never leaves a dangling grant. REVOKE is route-first: the directory dies
 * before the authority, so no window opens where a routing row outlives a
 * revoked credential in the other order. The raw code is printed once.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:event-code -- \
 *     --tenant sabana \
 *     --workspace 33333333-3333-4333-8333-333333333333 \
 *     --label "Orientation 2026" \
 *     --days 7 \
 *     --max-uses 200
 *
 *   pnpm --filter @vozlab/database db:event-code -- --revoke <raw-code|64-hex>
 *
 * Defaults: `--tenant sabana`, the seeded dev workspace, 7 days, unlimited uses.
 */
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  createRouterDrizzle,
  credentialRoutes,
  tenantConnections,
  tenants,
} from '../src/index.js';
import { hashOpaqueToken } from './token-hash.js';
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
  /** When set, the CLI revokes this credential (raw code or its SHA-256). */
  revoke?: string;
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
    '       db:event-code -- --revoke <raw-code|64-hex-code-hash> [--tenant <slug|uuid>]',
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
    'revoke',
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

  const revoke = values.get('revoke');
  if (revoke !== undefined && !HASH_RE.test(revoke) && !revoke.startsWith(RAW_CODE_PREFIX)) {
    fail('--revoke expects the raw code (vle_…) or its 64-character hex hash.');
  }

  return {
    tenant: values.get('tenant') ?? TENANT_SLUG,
    workspace,
    label: values.get('label'),
    days,
    maxUses,
    createdByHash,
    revoke,
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

/** Resolve the tenant row and its physical connection, or exit. */
async function resolveTenant(client: { db: ReturnType<typeof createRouterDrizzle>['db'] }, slugOrId: string) {
  const [tenant] = UUID_RE.test(slugOrId)
    ? await client.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, slugOrId))
        .limit(1)
    : await client.db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slugOrId))
        .limit(1);

  if (!tenant) {
    fail(`Tenant "${slugOrId}" is not provisioned in the router DB.`);
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

  return { tenant, connection };
}

/**
 * The credential hash from either presentation form: the raw code is
 * hashed exactly like `hashOpaqueToken`; a 64-hex value is taken as the
 * hash itself.
 */
function credentialHashOf(value: string): string {
  return HASH_RE.test(value) ? value.toLowerCase() : hashOpaqueToken(value);
}

async function mint(args: Args): Promise<void> {
  const client = createRouterDrizzle(routerConfig());
  try {
    const { tenant, connection } = await resolveTenant(client, args.tenant);

    // Validate the workspace in the tenant DB, then write the credential —
    // one tenant pool for both steps.
    const tenantPool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
    });
    try {
      const workspace = await tenantPool.query(
        `SELECT id, kind FROM auth.workspaces WHERE id = $1`,
        [args.workspace]
      );
      if (!workspace.rowCount) {
        fail(
          `Workspace ${args.workspace} does not exist in tenant "${tenant.slug}".`
        );
      }
      const kind = (workspace.rows[0] as { kind: string }).kind;
      if (kind !== 'EVENT') {
        fail(
          `Workspace ${args.workspace} has kind "${kind}" — EVENT codes only point at kind='EVENT' workspaces (the join path rejects any other kind).`
        );
      }

      const rawCode = `${RAW_CODE_PREFIX}${randomBytes(18).toString('base64url')}`;
      const codeHash = hashOpaqueToken(rawCode);
      const expiresAt = new Date(Date.now() + args.days * DAY_MS);

      // TENANT FIRST (DEC-3 sequencing): the authority row is the EVENT-
      // purpose join code. auto_approve=true is mandatory for EVENT rows —
      // the anonymous redemption statement additionally requires it, so a
      // false flag would birth a dead credential.
      const inserted = await tenantPool.query(
        `INSERT INTO auth.workspace_join_codes
           (workspace_id, code_hash, purpose, label, expires_at, max_uses,
            auto_approve, created_by_hash)
         VALUES ($1, $2, 'EVENT', $3, $4, $5, true, $6)
         RETURNING id`,
        [
          args.workspace,
          codeHash,
          args.label ?? null,
          expiresAt,
          args.maxUses ?? null,
          args.createdByHash ?? null,
        ]
      );
      if (!inserted.rowCount) {
        fail('The event code was not persisted in the tenant DB.');
      }

      // THEN the idempotent router directory upsert. A failed route insert
      // leaves the credential inert until a re-mint; the route never
      // grants anything by itself (ADR-0046).
      await client.db
        .insert(credentialRoutes)
        .values({
          credentialHash: codeHash,
          kind: 'EVENT',
          tenantId: tenant.id,
        })
        .onConflictDoNothing();

      console.log(
        '\n✅ Event code minted (tenant EVENT credential + router route)\n'
      );
      console.log(`  tenant      ${tenant.slug} (${tenant.id})`);
      console.log(`  workspace   ${args.workspace}`);
      if (args.label) console.log(`  label       ${args.label}`);
      console.log(
        `  expires     ${expiresAt.toISOString()} (${args.days} day(s))`
      );
      console.log(
        `  max uses    ${args.maxUses === undefined ? 'unlimited' : args.maxUses}`
      );
      console.log(`  code hash   ${codeHash}`);
      console.log('\nRaw code (only shown once — put this in the QR):\n');
      console.log(`  ${rawCode}\n`);
    } finally {
      await tenantPool.end();
    }
  } finally {
    await client.pool.end();
  }
}

async function revoke(args: Args, presented: string): Promise<void> {
  const codeHash = credentialHashOf(presented);
  const client = createRouterDrizzle(routerConfig());
  try {
    const { tenant, connection } = await resolveTenant(client, args.tenant);

    // ROUTE FIRST (audit D-5): kill the directory entry before the
    // authority row. The delete is TENANT-SCOPED: a wrong-tenant invocation
    // must never remove another tenant's route (and the "had a directory
    // entry in tenant X" message below only tells the truth if the row
    // belonged to X). A missing route is harmless — routing is not
    // authority (ADR-0046), and the tenant row revocation below is the
    // state that matters.
    const deleted = await client.db
      .delete(credentialRoutes)
      .where(
        and(
          eq(credentialRoutes.credentialHash, codeHash),
          eq(credentialRoutes.kind, 'EVENT'),
          eq(credentialRoutes.tenantId, tenant.id)
        )
      )
      .returning({ hash: credentialRoutes.credentialHash });

    const tenantPool = new Pool({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
    });
    try {
      const updated = await tenantPool.query(
        `UPDATE auth.workspace_join_codes
            SET revoked_at = now()
          WHERE code_hash = $1 AND purpose = 'EVENT'
          RETURNING id, (revoked_at IS NOT NULL) AS was_live`,
        [codeHash]
      );
      if (!updated.rowCount) {
        // Distinguish the two misses (T5 carry-over): when the directory
        // DELETE above removed a row but this tenant has no matching EVENT
        // credential, the revoke cleaned up a DANGLING ROUTE — a real action
        // — rather than doing nothing at all.
        if (deleted.length > 0) {
          fail(
            `Stale route removed; no tenant credential found — hash ${codeHash} had a directory entry in tenant "${tenant.slug}" but no EVENT row in auth.workspace_join_codes. The code is un-redeemable either way.`
          );
        }
        fail(
          `No EVENT credential with hash ${codeHash} exists in tenant "${tenant.slug}" — nothing was revoked. Present the raw code or its 64-hex SHA-256.`
        );
      }
      const row = updated.rows[0] as { id: string };
      console.log('\n✅ Event code revoked\n');
      console.log(`  tenant      ${tenant.slug} (${tenant.id})`);
      console.log(`  code hash   ${codeHash}`);
      console.log(`  credential  ${row.id}`);
      console.log(
        `  route       ${deleted.length > 0 ? 'deleted from credential_routes' : 'was not in the directory (harmless)'}\n`
      );
    } finally {
      await tenantPool.end();
    }
  } finally {
    await client.pool.end();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.revoke !== undefined) {
    await revoke(args, args.revoke);
    return;
  }
  await mint(args);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Event code operation failed:', message, '\n');
    process.exit(1);
  });
