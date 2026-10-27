/**
 * Revoke all sessions for a user (C7).
 *
 * Sets `sessions_valid_after = now()` on `auth.users` and revokes all
 * refresh token families for that user. Access tokens issued before the
 * revocation remain valid until they expire (max 15 min).
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:revoke-sessions -- --user <user-uuid> [--tenant <slug>]
 *
 * Defaults: --tenant sabana
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { users, refreshTokens } from '../src/schema/tenant.auth.schema.js';

const args = process.argv.slice(2);
const userArg = args.find((a) => a.startsWith('--user='))?.split('=')[1]
  ?? args[args.indexOf('--user') + 1];
const tenantSlug = args.find((a) => a.startsWith('--tenant='))?.split('=')[1]
  ?? args[args.indexOf('--tenant') + 1]
  ?? 'sabana';

if (!userArg) {
  console.error('Usage: --user <user-uuid> [--tenant <slug>]');
  process.exit(1);
}

const config = {
  host: process.env.TENANT_DB_HOST ?? 'localhost',
  port: Number(process.env.TENANT_DB_PORT ?? 5432),
  database: process.env.TENANT_DB_NAME ?? 'vozlab_tenant_dev',
  user: process.env.TENANT_DB_USER ?? 'postgres',
  password: process.env.TENANT_DB_PASSWORD ?? 'postgres',
};

const pool = new Pool(config);
const db = drizzle(pool);

async function main(): Promise<void> {
  const now = new Date();
  console.log(`Revoking sessions for user ${userArg} (tenant: ${tenantSlug})`);

  // 1. Set sessions_valid_after = now
  const updated = await db
    .update(users)
    .set({ sessionsValidAfter: now })
    .where(eq(users.id, userArg))
    .returning({ id: users.id });

  if (updated.length === 0) {
    console.error(`User ${userArg} not found.`);
    await pool.end();
    process.exit(1);
  }

  // 2. Revoke all refresh token families for this user.
  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(eq(refreshTokens.userId, userArg))
    .returning({ id: refreshTokens.id });

  console.log(`Revoked ${revoked.length} refresh token(s).`);
  console.log(`sessions_valid_after set to ${now.toISOString()}.`);
  console.log('Access tokens issued before this timestamp will be rejected on next refresh.');

  await pool.end();
}

main().catch((err) => {
  console.error('Revoke failed:', err);
  process.exit(1);
});