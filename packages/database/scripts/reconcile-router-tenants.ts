/**
 * Reconciliation job: router ↔ institutions (D14).
 *
 * Compares auth.users.global_identity_id and workspace_memberships status
 * with global_identity_tenants in the router DB. Creates missing links,
 * calculates tenant status (ACTIVE/SUSPENDED/LEFT), reports orphans (no PII).
 * Idempotent.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:reconcile-router-tenants
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql, eq } from 'drizzle-orm';
import { tenants, tenantConnections, globalIdentities, globalIdentityTenants } from '../src/schema/router.schema.js';

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
  console.log(`Reconciling ${allTenants.length} tenant(s).`);

  let totalLinks = 0;
  let totalOrphans = 0;

  for (const tenant of allTenants) {
    console.log(`\n--- Tenant: ${tenant.slug} (${tenant.id}) ---`);

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
      // Read local users with global_identity_id and their membership status.
      const rows = await tenantDb.execute(sql`
        SELECT u.id AS user_id, u.global_identity_id,
               (SELECT status FROM auth.workspace_memberships wm WHERE wm.user_id = u.id LIMIT 1) AS membership_status
        FROM auth.users u
        WHERE u.global_identity_id IS NOT NULL
      `);

      const users = rows.rows as Array<{
        user_id: string;
        global_identity_id: string;
        membership_status: string | null;
      }>;

      console.log(`  Found ${users.length} user(s) with global identity.`);

      // Get existing links for this tenant.
      const existingLinks = await routerDb
        .select()
        .from(globalIdentityTenants)
        .where(eq(globalIdentityTenants.tenantId, tenant.id));

      const existingMap = new Map(
        existingLinks.map((l) => [l.globalIdentityId, l])
      );

      for (const u of users) {
        const globalId = u.global_identity_id;
        const membershipStatus = u.membership_status;

        // Calculate tenant status for this user's link.
        let linkStatus: 'ACTIVE' | 'SUSPENDED' | 'LEFT' = 'LEFT';
        if (membershipStatus === 'ACTIVE') linkStatus = 'ACTIVE';
        else if (membershipStatus === 'SUSPENDED') linkStatus = 'SUSPENDED';
        else if (membershipStatus === 'REMOVED') linkStatus = 'LEFT';

        const existing = existingMap.get(globalId);
        if (existing) {
          // Update status if changed.
          if (existing.status !== linkStatus) {
            await routerDb
              .update(globalIdentityTenants)
              .set({ status: linkStatus, lastSeenAt: new Date() })
              .where(
                sql`global_identity_id = ${globalId}::uuid AND tenant_id = ${tenant.id}::uuid`
              );
            console.log(`  Updated link ${globalId} → ${linkStatus}`);
          }
        } else {
          // Create missing link.
          await routerDb.insert(globalIdentityTenants).values({
            globalIdentityId: globalId,
            tenantId: tenant.id,
            tenantUserId: u.user_id,
            status: linkStatus,
          }).onConflictDoNothing();
          console.log(`  Created link ${globalId} → ${linkStatus}`);
          totalLinks++;
        }
      }

      // Check for orphaned links (in router but not in tenant).
      const localGlobalIds = new Set(users.map((u) => u.global_identity_id));
      for (const link of existingLinks) {
        if (!localGlobalIds.has(link.globalIdentityId)) {
          console.log(`  ORPHAN: global identity ${link.globalIdentityId} has no local user.`);
          totalOrphans++;
        }
      }
    } catch (err) {
      console.error(`  Error processing tenant ${tenant.slug}:`, err);
    } finally {
      await tenantPool.end();
    }
  }

  console.log(`\nDone. Links created: ${totalLinks}, Orphans: ${totalOrphans}.`);
  await routerPool.end();
}

main().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});