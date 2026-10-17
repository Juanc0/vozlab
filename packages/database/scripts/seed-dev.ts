/**
 * DEV SEED — provision a router tenant + a base ontology in the tenant DB.
 *
 * DEVELOPMENT ONLY. Never wire this into app startup or `db:migrate`.
 *
 * Why this exists
 * ---------------
 * The documentation assumes a tenant is *provisioned* before use, but nothing
 * persisted the router rows (`tenants`, `tenant_connections`) or a base
 * ontology in the tenant DB. Without them `TenantWorkspaceGuard` always
 * answers `403 ERR_TENANT_NOT_PROVISIONED` and the API is unusable locally.
 *
 * What it provisions (idempotent — fixed UUIDs + ON CONFLICT DO NOTHING):
 *   Router DB  (`vozlab_router`)
 *     - tenants            : slug `sabana`, oidc_tenant_id `sabana`
 *     - tenant_connections : physical config of the dev tenant DB
 *   Tenant DB  (`vozlab_tenant_dev`)
 *     - auth.workspaces            : slug `general`
 *     - auth.users                 : dev maintainer (stable SHA-256 authorHash)
 *     - auth.workspace_memberships : user -> workspace, role ADMIN
 *     - meta.ontology_classes      : Problem, Idea, Resource (ACTIVE)
 *     - meta.datatype_properties   : title, description
 *     - meta.object_properties     : RELATES_TO (Problem -> Idea)
 *
 * JWT / guard mapping
 * -------------------
 * `TenantWorkspaceGuard` resolves the internal `tid` from the JWT `tid` claim
 * via `tenants.oidc_tenant_id`. The seeded value is `sabana`, so a token whose
 * `tid` claim is `sabana` resolves. Requests must also send the workspace UUID
 * in the `X-Workspace-ID` header (see the summary printed at the end).
 *
 * Credentials default to the docker-compose local values and are overridable
 * through the same env vars the drizzle configs use (`ROUTER_DB_*`,
 * `TENANT_DB_*`).
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:seed:dev
 */
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  createRouterDrizzle,
  tenants,
  tenantConnections,
  workspaces,
  users,
  workspaceMemberships,
  ontologyClasses,
  datatypeProperties,
  objectProperties,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixed identifiers — deterministic so the seed can be re-run safely.
// ---------------------------------------------------------------------------
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';
const CLASS_PROBLEM_ID = '66666666-6666-4666-8666-666666666661';
const CLASS_IDEA_ID = '66666666-6666-4666-8666-666666666662';
const CLASS_RESOURCE_ID = '66666666-6666-4666-8666-666666666663';
const DTP_TITLE_ID = '77777777-7777-4777-8777-777777777771';
const DTP_DESCRIPTION_ID = '77777777-7777-4777-8777-777777777772';
const OP_RELATES_TO_ID = '88888888-8888-4888-8888-888888888888';

const TENANT_SLUG = 'sabana';
const OIDC_TENANT_ID = 'sabana';
const WORKSPACE_SLUG = 'general';

/** Valid 64-char hex SHA-256 required by the `AuthorHash` value object. */
const AUTHOR_HASH = createHash('sha256').update('dev-maintainer').digest('hex');

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

async function seed(): Promise<void> {
  const { db: routerDb, pool: routerPool } = createRouterDrizzle(routerConfig);
  const tenantPool = new Pool(tenantConfig);
  const tenantDb = drizzle(tenantPool);

  try {
    // --- Router DB: tenant registry + physical connection ------------------
    await routerDb
      .insert(tenants)
      .values({
        id: TENANT_ID,
        slug: TENANT_SLUG,
        oidcTenantId: OIDC_TENANT_ID,
        name: 'Universidad Sabana (dev)',
        description: 'Local development tenant',
      })
      .onConflictDoNothing();

    await routerDb
      .insert(tenantConnections)
      .values({
        id: TENANT_CONNECTION_ID,
        tenantId: TENANT_ID,
        host: tenantConfig.host,
        port: tenantConfig.port,
        database: tenantConfig.database,
        user: tenantConfig.user,
        password: tenantConfig.password,
      })
      .onConflictDoNothing();

    // --- Tenant DB: workspace, user, membership ---------------------------
    await tenantDb
      .insert(workspaces)
      .values({
        id: WORKSPACE_ID,
        slug: WORKSPACE_SLUG,
        name: 'General Campus',
        description: 'Dev workspace',
      })
      .onConflictDoNothing();

    await tenantDb
      .insert(users)
      .values({
        id: USER_ID,
        provider: 'OIDC_INSTITUTIONAL',
        providerUserId: 'dev-maintainer',
        authorHash: AUTHOR_HASH,
        fullName: 'Dev Maintainer',
        email: 'dev-maintainer@example.edu',
        systemRole: 'ADMIN',
      })
      .onConflictDoNothing();

    await tenantDb
      .insert(workspaceMemberships)
      .values({
        id: MEMBERSHIP_ID,
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        role: 'ADMIN',
      })
      .onConflictDoNothing();

    // --- Tenant DB: base ontology (US-00 fixture) -------------------------
    await tenantDb
      .insert(ontologyClasses)
      .values([
        {
          id: CLASS_PROBLEM_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'Problem',
          displayNames: { en: 'Problem', es: 'Problema' },
          descriptions: {
            en: 'A challenge or need raised by the community.',
            es: 'Un reto o necesidad planteada por la comunidad.',
          },
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: CLASS_IDEA_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'Idea',
          displayNames: { en: 'Idea', es: 'Idea' },
          descriptions: {
            en: 'A proposed solution or approach.',
            es: 'Una solución o enfoque propuesto.',
          },
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: CLASS_RESOURCE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'Resource',
          displayNames: { en: 'Resource', es: 'Recurso' },
          descriptions: {
            en: 'Material, data or tool relevant to the community.',
            es: 'Material, dato o herramienta relevante para la comunidad.',
          },
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
      ])
      .onConflictDoNothing();

    await tenantDb
      .insert(datatypeProperties)
      .values([
        {
          id: DTP_TITLE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'title',
          displayNames: { en: 'Title', es: 'Título' },
          datatype: 'string',
          isRequired: true,
          domainClassKey: 'Problem',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_DESCRIPTION_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'description',
          displayNames: { en: 'Description', es: 'Descripción' },
          datatype: 'string',
          isRequired: false,
          domainClassKey: 'Problem',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
      ])
      .onConflictDoNothing();

    await tenantDb
      .insert(objectProperties)
      .values({
        id: OP_RELATES_TO_ID,
        workspaceId: WORKSPACE_ID,
        systemKey: 'RELATES_TO',
        displayNames: { en: 'Relates to', es: 'Se relaciona con' },
        descriptions: {
          en: 'Links a problem to a proposed idea.',
          es: 'Vincula un problema con una idea propuesta.',
        },
        domainClassKey: 'Problem',
        rangeClassKey: 'Idea',
        isDirectional: true,
        isSymmetric: false,
        allowsSelfRelation: false,
        status: 'ACTIVE',
        proposedBy: AUTHOR_HASH,
      })
      .onConflictDoNothing();

    // --- Summary -----------------------------------------------------------
    console.log('\n✅ Dev seed applied (idempotent).\n');
    console.log('Router DB:', routerConfig.database);
    console.log(`  tenant id         ${TENANT_ID}`);
    console.log(`  slug              ${TENANT_SLUG}`);
    console.log(`  oidc_tenant_id    ${OIDC_TENANT_ID}  <- JWT "tid" claim must be this`);
    console.log('Tenant DB:', tenantConfig.database);
    console.log(`  workspace id      ${WORKSPACE_ID}  <- X-Workspace-ID header`);
    console.log(`  workspace slug    ${WORKSPACE_SLUG}`);
    console.log(`  user id           ${USER_ID}`);
    console.log(`  authorHash        ${AUTHOR_HASH}`);
    console.log(
      '\nMint a JWT with tid="sabana" and call with header:\n' +
        `  X-Workspace-ID: ${WORKSPACE_ID}\n`
    );
  } finally {
    await routerPool.end();
    await tenantPool.end();
  }
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Dev seed failed:', message);
    console.error(
      '\nIs Postgres running and migrated? Try:\n' +
        '  docker compose up -d\n' +
        '  pnpm --filter @vozlab/database db:migrate\n'
    );
    process.exit(1);
  });
