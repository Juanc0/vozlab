/**
 * Backfill global identities (D13).
 *
 * Iterates over all tenants in the router DB, reads (issuer, subject) from
 * auth.external_identities in each tenant DB, upserts into
 * router.global_identities, and stores the global_identity_id on auth.users.
 * Reports conflicts (two local users with the same global identity) without
 * aborting.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:backfill:global-identities
 *
 * DEVELOPMENT / MIGRATION ONLY.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { tenants, tenantConnections, globalIdentities } from '../src/schema/router.schema.js';

const routerConfig = {
  host: process.env.ROUTER_DB_HOST ?? 'localhost',
  port: Number(process.env.ROUTER_DB_PORT ?? 5432),
  database: process.env.ROUTER_DB_NAME ?? 'vozlab_router',
  user: process.env.ROUTER_DB_USER ?? 'postgres',
  password: process.env.ROUTER_DB_PASSWORD ?? 'postgres',
};

async function main(): Promise<void> {
  const routerPool = new Pool(routerConfig);
  const routerDb = drizzle(routerPool);

  const allTenants = await routerDb.select().from(tenants);
  console.log(`Found ${allTenants.length} tenant(s).`);

  let totalProcessed = 0;
  let totalConflicts = 0;

  for (const tenant of allTenants) {
    console.log(`\n--- Tenant: ${tenant.slug} (${tenant.id}) ---`);

    // Get tenant DB connection config.
    const [conn] = await routerDb
      .select()
      .from(tenantConnections)
      .where(eq(tenantConnections.tenantId, tenant.id))
      .limit(1);

    if (!conn) {
      console.log('  No connection config, skipping.');
      continue;
    }

    const tenantPool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: conn.password,
    });
    const tenantDb = drizzle(tenantPool);

    try {
      // Read users with their external identities.
      const rows = await tenantDb.execute(sql`
        SELECT u.id AS user_id, ei.issuer, ei.subject
        FROM auth.users u
        JOIN auth.external_identities ei ON ei.user_id = u.id
        WHERE u.global_identity_id IS NULL
      `);

      const users = rows.rows as Array<{ user_id: string; issuer: string; subject: string }>;
      console.log(`  Found ${users.length} user(s) without global identity.`);

      for (const u of users) {
        // Upsert into global_identities.
        const [gi] = await routerDb
          .insert(globalIdentities)
          .values({ issuer: u.issuer, subject: u.subject })
          .onConflictDoNothing()
          .returning();

        let globalId: string;
        if (gi) {
          globalId = gi.id;
        } else {
          // Already exists — fetch it.
          const [existing] = await routerDb
            .select()
            .from(globalIdentities)
            .where(
              sql`issuer = ${u.issuer} AND subject = ${u.subject}`
            )
            .limit(1);
          globalId = existing.id;
        }

        // Check for conflicts: another local user with the same global identity.
        const conflictCheck = await tenantDb.execute(sql`
          SELECT count(*)::int AS cnt FROM auth.users
          WHERE global_identity_id = ${globalId}::uuid AND id != ${u.user_id}::uuid
        `);
        const conflictCount = (conflictCheck.rows[0] as { cnt: number }).cnt;

        if (conflictCount > 0) {
          console.log(`  CONFLICT: user ${u.user_id} shares global identity ${globalId} with ${conflictCount} other user(s).`);
          totalConflicts++;
        }

        // Update the user's global_identity_id.
        await tenantDb.execute(sql`
          UPDATE auth.users SET global_identity_id = ${globalId}::uuid WHERE id = ${u.user_id}::uuid
        `);

        totalProcessed++;
      }
    } catch (err) {
      console.error(`  Error processing tenant ${tenant.slug}:`, err);
    } finally {
      await tenantPool.end();
    }
  }

  console.log(`\nDone. Processed: ${totalProcessed}, Conflicts: ${totalConflicts}.`);
  await routerPool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});