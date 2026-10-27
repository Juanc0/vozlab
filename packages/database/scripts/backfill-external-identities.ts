/**
 * Backfill script: populate auth.external_identities from existing
 * auth.users rows that have a provider_user_id.
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:backfill:external-identities -- --issuer <issuer-url>
 *
 * The issuer is the OIDC issuer of the identity provider that originally
 * created the users (e.g. https://idp.test for dev, or the Zitadel URL for prod).
 * The script is idempotent: ON CONFLICT DO NOTHING.
 *
 * DEVELOPMENT / MIGRATION ONLY. Run once per issuer.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const issuer = process.argv.find((a) => a.startsWith('--issuer='))?.split('=')[1]
  ?? process.argv[process.argv.indexOf('--issuer') + 1];

if (!issuer) {
  console.error('Usage: --issuer <issuer-url>');
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
  console.log(`Backfilling external_identities for issuer: ${issuer}`);

  const result = await db.execute(sql`
    INSERT INTO auth.external_identities (user_id, issuer, subject, provider_kind, last_login_at)
    SELECT u.id, ${issuer}, u.provider_user_id, u.provider, u.created_at
    FROM auth.users u
    WHERE u.provider_user_id IS NOT NULL
      AND u.provider = 'OIDC_INSTITUTIONAL'
    ON CONFLICT (issuer, subject) DO NOTHING
  `);

  console.log(`Inserted ${result.rowCount ?? 0} rows (conflicts skipped).`);
  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});