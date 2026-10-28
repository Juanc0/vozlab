/**
 * DEV SEED — provision a router tenant, a base ontology and the Spanish
 * demo graph in the tenant DB.
 *
 * DEVELOPMENT ONLY. Never wire this into app startup or `db:migrate`.
 *
 * ⚠️  THIS SCRIPT IS DESTRUCTIVE ON A DEVELOPMENT DATABASE.
 * ⚠️  It DELETES every node, relation, proposal, discussion and vote of the
 * ⚠️  dev workspace that is not part of the demo seed — the leftover English
 * ⚠️  nodes, anything the E2E suite created, any experiment. The demo is
 * ⚠️  deterministic because `db:seed:dev` is the operator's reset button.
 * ⚠️  Never point it at a database that holds data you care about.
 *
 * Why this exists
 * ---------------
 * The documentation assumes a tenant is *provisioned* before use, but nothing
 * persisted the router rows (`tenants`, `tenant_connections`) or a base
 * ontology in the tenant DB. Without them `TenantWorkspaceGuard` always
 * answers `403 ERR_TENANT_NOT_PROVISIONED` and the API is unusable locally.
 *
 * What it provisions (idempotent — fixed UUIDs; the base rows are written
 * with ON CONFLICT DO NOTHING and the demo graph with an UPSERT, so a second
 * run restores the demo to its pristine state):
 *   Router DB  (`vozlab_router`)
 *     - tenants            : slug `sabana`, oidc_tenant_id `sabana`
 *     - tenant_connections : physical config of the dev tenant DB
 *   Tenant DB  (`vozlab_tenant_dev`)
 *     - auth.workspaces            : slug `general`
 *     - auth.users                 : 5 dev identities (stable authorHash each)
 *     - auth.workspace_memberships : 3 of them (the two agents have none)
 *     - meta.ontology_classes      : Problem, Idea, Resource (ACTIVE)
 *     - meta.datatype_properties   : title, description + sector, alcance,
 *                                    horizonte, costoEstimado, enlace,
 *                                    tipoFuente
 *     - meta.object_properties     : RELATES_TO, INVOLVES, ADDRESSES,
 *                                    BUILDS_ON, EVIDENCED_BY
 *     - meta.data_sources          : one dev source
 *     - public.nodes / public.edges : the Spanish demo graph (3 clusters)
 *     - public.edit_proposals      : 4 proposals (3 pending, 1 approved)
 *     - social.discussion_*        : 3 threads with 10 posts (3 nested)
 *     - public.interactions_log    : the votes behind the community scores
 *
 * The demo graph lives in `./demo-content.js`; the identities live in
 * `./dev-identities.js` and are shared with `mint-dev-token.ts`, so the seeded
 * `author_hash` and the one embedded in a minted token are guaranteed to
 * match.
 *
 * JWT / guard mapping
 * -------------------
 * `TenantWorkspaceGuard` resolves the internal `tid` from the JWT `tid` claim
 * via `tenants.oidc_tenant_id`. The seeded value is `sabana`, so a token whose
 * `tid` claim is `sabana` resolves. The JWT `sub` must be the identity's
 * `auth.users.id` UUID (membership is looked up by `user_id`). Requests must
 * also send the workspace UUID in the `X-Workspace-ID` header.
 *
 * Credentials default to the docker-compose local values and are overridable
 * through the same env vars the drizzle configs use (`ROUTER_DB_*`,
 * `TENANT_DB_*`).
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:seed:dev
 */
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
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
  dataSources,
  nodes,
  edges,
  editProposals,
  interactionsLog,
  discussionThreads,
  discussionPosts,
} from '../src/index.js';
import {
  authorHashFor,
  DEV_IDENTITIES,
  DEV_IDENTITY_NAMES,
  OIDC_TENANT_ID,
  TENANT_CONNECTION_ID,
  TENANT_ID,
  TENANT_SLUG,
  GOOGLE_TENANT_ID,
  GOOGLE_TENANT_SLUG,
  GOOGLE_OIDC_TENANT_ID,
  ENTRA_TENANT_ID,
  ENTRA_TENANT_SLUG,
  ENTRA_OIDC_TENANT_ID,
  GOOGLE_PERSONAL_TENANT_ID,
  GOOGLE_PERSONAL_TENANT_SLUG,
  GOOGLE_PERSONAL_OIDC_TENANT_ID,
  WORKSPACE_ID,
  WORKSPACE_SLUG,
} from './dev-identities.js';
import {
  DEMO_CLUSTERS,
  RELATION_LABELS,
  resolveDemoGraph,
  type DemoClusterKey,
  type DemoRelationKey,
  type ResolvedDemoGraph,
} from './demo-content.js';

// ---------------------------------------------------------------------------
// Fixed identifiers — deterministic so the seed can be re-run safely.
// ---------------------------------------------------------------------------
const CLASS_PROBLEM_ID = '66666666-6666-4666-8666-666666666661';
const CLASS_IDEA_ID = '66666666-6666-4666-8666-666666666662';
const CLASS_RESOURCE_ID = '66666666-6666-4666-8666-666666666663';
const DTP_TITLE_ID = '77777777-7777-4777-8777-777777777771';
const DTP_DESCRIPTION_ID = '77777777-7777-4777-8777-777777777772';
const DTP_SECTOR_ID = '77777777-7777-4777-8777-777777777781';
const DTP_ALCANCE_ID = '77777777-7777-4777-8777-777777777782';
const DTP_HORIZONTE_ID = '77777777-7777-4777-8777-777777777783';
const DTP_COSTO_ID = '77777777-7777-4777-8777-777777777784';
const DTP_ENLACE_ID = '77777777-7777-4777-8777-777777777785';
const DTP_TIPO_FUENTE_ID = '77777777-7777-4777-8777-777777777786';
const OP_RELATES_TO_ID = '88888888-8888-4888-8888-888888888888';
const OP_INVOLVES_ID = '88888888-8888-4888-8888-888888888881';
const OP_ADDRESSES_ID = '88888888-8888-4888-8888-888888888882';
const OP_BUILDS_ON_ID = '88888888-8888-4888-8888-888888888883';
const OP_EVIDENCED_BY_ID = '88888888-8888-4888-8888-888888888884';
const DATA_SOURCE_ID = '99999999-9999-4999-8999-999999999991';

/** Valid 64-char hex SHA-256 required by the `AuthorHash` value object. */
const AUTHOR_HASH = authorHashFor('maintainer');
/** The proposals are written by a regular member, not by the maintainer. */
const MEMBER_HASH = authorHashFor('member');

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

/** What the reset removed, so the report can tell the operator. */
interface RemovedContent {
  readonly nodes: readonly { id: string; title: string }[];
  readonly edges: number;
  readonly proposals: number;
  readonly threads: number;
  readonly posts: number;
  readonly votes: number;
}

/** Truncate a long title so the report stays readable. */
function shorten(text: string, max = 62): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function seed(): Promise<void> {
  const { db: routerDb, pool: routerPool } = createRouterDrizzle(routerConfig);
  const tenantPool = new Pool(tenantConfig);
  const tenantDb = drizzle(tenantPool);

  try {
    // --- Router DB: tenant registry + physical connection ------------------
    // Multiple tenants share the same dev DB for simplicity.
    const devTenants = [
      { id: TENANT_ID, slug: TENANT_SLUG, oidcTenantId: OIDC_TENANT_ID, name: 'Universidad Sabana (dev)' },
      { id: GOOGLE_TENANT_ID, slug: GOOGLE_TENANT_SLUG, oidcTenantId: GOOGLE_OIDC_TENANT_ID, name: 'Google Institucional (dev)' },
      { id: ENTRA_TENANT_ID, slug: ENTRA_TENANT_SLUG, oidcTenantId: ENTRA_OIDC_TENANT_ID, name: 'Entra Institucional (dev)' },
      { id: GOOGLE_PERSONAL_TENANT_ID, slug: GOOGLE_PERSONAL_TENANT_SLUG, oidcTenantId: GOOGLE_PERSONAL_OIDC_TENANT_ID, name: 'Google Personal (dev)' },
    ];

    for (const t of devTenants) {
      await routerDb
        .insert(tenants)
        .values({
          id: t.id,
          slug: t.slug,
          oidcTenantId: t.oidcTenantId,
          name: t.name,
          description: 'Local development tenant',
        })
        .onConflictDoNothing();
    }

    // Physical connection for the primary tenant (others share for dev).
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

    // Share the same connection for the other dev tenants.
    const extraConnections = [
      { id: '77777777-7777-4777-8777-777777777777', tenantId: GOOGLE_TENANT_ID },
      { id: '88888888-8888-4888-8888-888888888888', tenantId: ENTRA_TENANT_ID },
      { id: '99999999-9999-4999-8999-999999999999', tenantId: GOOGLE_PERSONAL_TENANT_ID },
    ];
    for (const c of extraConnections) {
      await routerDb
        .insert(tenantConnections)
        .values({
          id: c.id,
          tenantId: c.tenantId,
          host: tenantConfig.host,
          port: tenantConfig.port,
          database: tenantConfig.database,
          user: tenantConfig.user,
          password: tenantConfig.password,
        })
        .onConflictDoNothing();
    }

    // --- Tenant DB: workspace, users, memberships -------------------------
    await tenantDb
      .insert(workspaces)
      .values({
        id: WORKSPACE_ID,
        slug: WORKSPACE_SLUG,
        name: 'General Campus',
        description: 'Dev workspace',
        isPublic: true,
        // Routing hint only: it identifies the workspace to a user who was
        // told the code; it never grants access (US-00).
        joinCode: '7532D05897A9D6C5',
      })
      .onConflictDoNothing();

    // One row per dev identity (fixed ids + stable authorHash -> idempotent).
    await tenantDb
      .insert(users)
      .values(
        DEV_IDENTITY_NAMES.map((name) => {
          const identity = DEV_IDENTITIES[name];
          return {
            id: identity.id,
            provider: 'OIDC_INSTITUTIONAL',
            providerUserId: identity.providerUserId,
            authorHash: identity.authorHash,
            fullName: identity.fullName,
            email: identity.email,
            systemRole: identity.systemRole,
          };
        }),
      )
      .onConflictDoNothing();

    // Memberships — the system agent acts platform-wide and has none.
    await tenantDb
      .insert(workspaceMemberships)
      .values(
        DEV_IDENTITY_NAMES.flatMap((name) => {
          const identity = DEV_IDENTITIES[name];
          if (identity.membership === null) return [];
          return {
            id: identity.membership.id,
            workspaceId: WORKSPACE_ID,
            userId: identity.id,
            role: identity.membership.role,
          };
        }),
      )
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

    // The datatype properties drive the dynamic node form (FR-06). The ones
    // that re-declare `title` or `description` are skipped by the form (they
    // collide with the node's own columns), so the demo needs attributes
    // that are not those two.
    await tenantDb
      .insert(datatypeProperties)
      .values([
        {
          id: DTP_TITLE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'title',
          displayNames: { en: 'Title', es: 'Título' },
          descriptions: {
            en: 'Short name of the node.',
            es: 'Nombre corto del nodo.',
          },
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
          descriptions: {
            en: 'What the node is about.',
            es: 'De qué trata el nodo.',
          },
          datatype: 'string',
          isRequired: false,
          domainClassKey: 'Problem',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_SECTOR_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'sector',
          displayNames: { en: 'Sector', es: 'Sector' },
          descriptions: {
            en: 'The area of the university the problem belongs to.',
            es: 'La área de la universidad a la que pertenece el problema.',
          },
          datatype: 'enum',
          allowedValues: ['Transporte', 'Espacios', 'Bienestar', 'Académico', 'Energía'],
          isRequired: true,
          domainClassKey: 'Problem',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_ALCANCE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'alcance',
          displayNames: { en: 'Scope', es: 'Alcance' },
          descriptions: {
            en: 'The level the problem reaches: the campus, a faculty or the city.',
            es: 'El nivel al que llega el problema: el campus, una facultad o la ciudad.',
          },
          datatype: 'enum',
          allowedValues: ['Campus', 'Facultad', 'Ciudad'],
          isRequired: true,
          domainClassKey: 'Problem',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_HORIZONTE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'horizonte',
          displayNames: { en: 'Time horizon', es: 'Horizonte' },
          descriptions: {
            en: 'When the idea could be implemented.',
            es: 'Cuándo se podría implementar la idea.',
          },
          datatype: 'enum',
          allowedValues: ['Corto plazo', 'Medio plazo', 'Largo plazo'],
          isRequired: true,
          domainClassKey: 'Idea',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_COSTO_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'costoEstimado',
          displayNames: { en: 'Estimated cost', es: 'Costo estimado' },
          descriptions: {
            en: 'Estimated implementation cost, in Colombian pesos.',
            es: 'Costo estimado de implementación, en pesos colombianos.',
          },
          datatype: 'number',
          isRequired: false,
          domainClassKey: 'Idea',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_ENLACE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'enlace',
          displayNames: { en: 'Link', es: 'Enlace' },
          descriptions: {
            en: 'Where the material can be found.',
            es: 'Dónde se encuentra el material.',
          },
          datatype: 'string',
          isRequired: true,
          domainClassKey: 'Resource',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: DTP_TIPO_FUENTE_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'tipoFuente',
          displayNames: { en: 'Source type', es: 'Tipo de fuente' },
          descriptions: {
            en: 'The kind of material the resource is.',
            es: 'El tipo de material del recurso.',
          },
          datatype: 'enum',
          allowedValues: ['Informe', 'Datos', 'Norma', 'Curso', 'Encuesta'],
          isRequired: true,
          domainClassKey: 'Resource',
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
      ])
      .onConflictDoNothing();

    // The typed relations. The domain/range of each row is the rule the API
    // enforces when an edge is created, so the demo relations respect it.
    await tenantDb
      .insert(objectProperties)
      .values([
        {
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
        },
        {
          id: OP_INVOLVES_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'INVOLVES',
          displayNames: { en: 'Involves', es: 'Involucra' },
          descriptions: {
            en: 'A problem that involves another problem.',
            es: 'Un problema que involucra a otro problema.',
          },
          domainClassKey: 'Problem',
          rangeClassKey: 'Problem',
          isDirectional: true,
          isSymmetric: false,
          allowsSelfRelation: true,
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: OP_ADDRESSES_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'ADDRESSES',
          displayNames: { en: 'Addresses', es: 'Atiende' },
          descriptions: {
            en: 'An idea that addresses a problem.',
            es: 'Una idea que atiende un problema.',
          },
          domainClassKey: 'Idea',
          rangeClassKey: 'Problem',
          isDirectional: true,
          isSymmetric: false,
          allowsSelfRelation: false,
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: OP_BUILDS_ON_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'BUILDS_ON',
          displayNames: { en: 'Builds on', es: 'Se apoya en' },
          descriptions: {
            en: 'An idea that builds on another idea.',
            es: 'Una idea que se apoya en otra idea.',
          },
          domainClassKey: 'Idea',
          rangeClassKey: 'Idea',
          isDirectional: true,
          isSymmetric: false,
          allowsSelfRelation: true,
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
        {
          id: OP_EVIDENCED_BY_ID,
          workspaceId: WORKSPACE_ID,
          systemKey: 'EVIDENCED_BY',
          displayNames: { en: 'Evidenced by', es: 'Está respaldado por' },
          descriptions: {
            en: 'A problem backed by a resource (a report, a norm, a survey).',
            es: 'Un problema respaldado por un recurso (un informe, una norma, una encuesta).',
          },
          domainClassKey: 'Problem',
          rangeClassKey: 'Resource',
          isDirectional: true,
          isSymmetric: false,
          allowsSelfRelation: false,
          status: 'ACTIVE',
          proposedBy: AUTHOR_HASH,
        },
      ])
      .onConflictDoNothing();

    // --- Data sources (ADR-0009, ADR-0025) -------------------------------
    // One example source so the resolution route can be exercised locally.
    // There is no management route yet: the registry is filled by an operator.
    await tenantDb
      .insert(dataSources)
      .values({
        id: DATA_SOURCE_ID,
        workspaceId: WORKSPACE_ID,
        sourceKey: 'dev-minutes-2026',
        connectorType: 'MINUTES',
        behaviorProfile: 'BATCH',
        displayName: 'Dev meeting minutes',
        status: 'ACTIVE',
      })
      .onConflictDoNothing();

    // --- The demo graph ---------------------------------------------------
    const graph = resolveDemoGraph();
    const removed = await resetWorkspaceContent(tenantDb, graph);
    await insertDemoGraph(tenantDb, graph);

    // --- Report ------------------------------------------------------------
    printReport(graph, removed);
  } finally {
    await routerPool.end();
    await tenantPool.end();
  }
}

/**
 * Remove every row of the dev workspace that the seed does not own.
 *
 * The demo is deterministic because the seed is the operator's reset button:
 * the leftover English nodes and whatever the E2E suite created are removed
 * before the demo content is written. The nodes are hard-deleted, and their
 * relations cascade with them.
 */
async function resetWorkspaceContent(
  tenantDb: ReturnType<typeof drizzle>,
  graph: ResolvedDemoGraph
): Promise<RemovedContent> {
  const seedVoteIds = graph.votes.map((vote) => vote.id);
  const seedPostIds = graph.posts.map((post) => post.id);
  const seedThreadIds = graph.threads.map((thread) => thread.id);
  const seedProposalIds = graph.proposals.map((proposal) => proposal.id);
  const seedEdgeIds = graph.edges.map((edge) => edge.id);
  const seedNodeIds = graph.nodes.map((node) => node.id);

  const removedVotes = await tenantDb
    .delete(interactionsLog)
    .where(
      and(
        eq(interactionsLog.workspaceId, WORKSPACE_ID),
        notInArray(interactionsLog.id, seedVoteIds)
      )
    )
    .returning({ id: interactionsLog.id });

  // The posts have no workspace column: they are reached through their thread.
  const workspaceThreads = await tenantDb
    .select({ id: discussionThreads.id })
    .from(discussionThreads)
    .where(eq(discussionThreads.workspaceId, WORKSPACE_ID));

  const removedPosts = await tenantDb
    .delete(discussionPosts)
    .where(
      and(
        inArray(
          discussionPosts.threadId,
          workspaceThreads.map((thread) => thread.id)
        ),
        notInArray(discussionPosts.id, seedPostIds)
      )
    )
    .returning({ id: discussionPosts.id });

  const removedThreads = await tenantDb
    .delete(discussionThreads)
    .where(
      and(
        eq(discussionThreads.workspaceId, WORKSPACE_ID),
        notInArray(discussionThreads.id, seedThreadIds)
      )
    )
    .returning({ id: discussionThreads.id });

  const removedProposals = await tenantDb
    .delete(editProposals)
    .where(
      and(
        eq(editProposals.workspaceId, WORKSPACE_ID),
        notInArray(editProposals.id, seedProposalIds)
      )
    )
    .returning({ id: editProposals.id });

  const removedEdges = await tenantDb
    .delete(edges)
    .where(
      and(
        eq(edges.workspaceId, WORKSPACE_ID),
        notInArray(edges.id, seedEdgeIds)
      )
    )
    .returning({ id: edges.id });

  const removedNodes = await tenantDb
    .delete(nodes)
    .where(
      and(eq(nodes.workspaceId, WORKSPACE_ID), notInArray(nodes.id, seedNodeIds))
    )
    .returning({ id: nodes.id, title: nodes.title });

  return {
    nodes: removedNodes,
    edges: removedEdges.length,
    proposals: removedProposals.length,
    threads: removedThreads.length,
    posts: removedPosts.length,
    votes: removedVotes.length,
  };
}

/**
 * Write the demo graph.
 *
 * Every row has a fixed id, so the write is idempotent. The insert is an
 * UPSERT on purpose: `db:seed:dev` is the operator's reset button, so a
 * second run also restores the demo to its pristine state (a proposal that
 * was approved during the demo goes back to `PENDING`, a node that was
 * edited or soft-deleted goes back to the seeded value).
 */
async function insertDemoGraph(
  tenantDb: ReturnType<typeof drizzle>,
  graph: ResolvedDemoGraph
): Promise<void> {
  await tenantDb
    .insert(nodes)
    .values(
      graph.nodes.map((node) => ({
        id: node.id,
        workspaceId: WORKSPACE_ID,
        typeKey: node.typeKey,
        title: node.title,
        description: node.description,
        attributes: node.attributes,
        authorHash: AUTHOR_HASH,
        status: 'ACTIVE',
        communityScore: scoreOf(graph, 'NODE', node.id),
        createdAt: new Date(node.createdAt),
        updatedAt: new Date(node.updatedAt),
      }))
    )
    .onConflictDoUpdate({
      target: nodes.id,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        attributes: sql`excluded.attributes`,
        status: sql`excluded.status`,
        communityScore: sql`excluded.community_score`,
        updatedAt: sql`excluded.updated_at`,
        // A node soft-deleted during the demo comes back.
        deletedAt: null,
      },
    });

  await tenantDb
    .insert(edges)
    .values(
      graph.edges.map((edge) => ({
        id: edge.id,
        workspaceId: WORKSPACE_ID,
        sourceNodeId: edge.fromNodeId,
        targetNodeId: edge.toNodeId,
        relationKey: edge.relationKey,
        attributes: {},
        status: 'ACTIVE',
        communityScore: scoreOf(graph, 'EDGE', edge.id),
        authorHash: AUTHOR_HASH,
        createdAt: new Date(edge.createdAt),
      }))
    )
    .onConflictDoUpdate({
      target: edges.id,
      set: {
        relationKey: sql`excluded.relation_key`,
        status: sql`excluded.status`,
        communityScore: sql`excluded.community_score`,
        deletedAt: null,
      },
    });

  await tenantDb
    .insert(editProposals)
    .values(
      graph.proposals.map((proposal) => ({
        id: proposal.id,
        workspaceId: WORKSPACE_ID,
        targetId: proposal.targetId,
        targetType: proposal.targetType,
        kind: proposal.kind,
        proposerHash: MEMBER_HASH,
        proposedChanges: proposal.proposedChanges,
        justification: proposal.justification,
        communityScore: proposal.communityScore,
        status: proposal.status,
        resolvedBy: proposal.resolvedAt === null ? null : AUTHOR_HASH,
        resolvedAt: proposal.resolvedAt === null ? null : new Date(proposal.resolvedAt),
        createdAt: new Date(proposal.createdAt),
      }))
    )
    .onConflictDoUpdate({
      target: editProposals.id,
      set: {
        proposedChanges: sql`excluded.proposed_changes`,
        justification: sql`excluded.justification`,
        communityScore: sql`excluded.community_score`,
        status: sql`excluded.status`,
        resolvedBy: sql`excluded.resolved_by`,
        resolvedAt: sql`excluded.resolved_at`,
      },
    });

  await tenantDb
    .insert(discussionThreads)
    .values(
      graph.threads.map((thread) => ({
        id: thread.id,
        workspaceId: WORKSPACE_ID,
        targetId: thread.targetId,
        targetType: thread.targetType,
        title: thread.title,
        status: 'OPEN',
        createdByHash: authorHashFor(thread.createdBy),
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.createdAt),
      }))
    )
    .onConflictDoUpdate({
      target: discussionThreads.id,
      set: {
        title: sql`excluded.title`,
        status: sql`excluded.status`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  await tenantDb
    .insert(discussionPosts)
    .values(
      graph.posts.map((post) => ({
        id: post.id,
        threadId: post.threadId,
        parentPostId: post.parentPostId,
        authorHash: authorHashFor(post.author),
        body: post.body,
        upvotes: post.upvotes,
        downvotes: post.downvotes,
        communityScore: post.communityScore,
        createdAt: new Date(post.createdAt),
      }))
    )
    .onConflictDoUpdate({
      target: discussionPosts.id,
      set: {
        body: sql`excluded.body`,
        upvotes: sql`excluded.upvotes`,
        downvotes: sql`excluded.downvotes`,
        communityScore: sql`excluded.community_score`,
        deletedAt: null,
      },
    });

  await tenantDb
    .insert(interactionsLog)
    .values(
      graph.votes.map((vote) => ({
        id: vote.id,
        workspaceId: WORKSPACE_ID,
        userHash: vote.userHash,
        targetId: vote.targetId,
        targetType: vote.targetType,
        interactionType: vote.interactionType,
        value: vote.value,
        createdAt: new Date(vote.createdAt),
      }))
    )
    .onConflictDoNothing();
}

/** The community score of a target: the sum of the votes recorded for it. */
function scoreOf(
  graph: ResolvedDemoGraph,
  targetType: 'NODE' | 'EDGE' | 'PROPOSAL' | 'POST',
  targetId: string
): number {
  return graph.votes
    .filter((vote) => vote.targetType === targetType && vote.targetId === targetId)
    .reduce((total, vote) => total + vote.value, 0);
}

/**
 * The report the presenter reads off the terminal. Spanish labels: the demo
 * is shown in front of an audience.
 */
function printReport(graph: ResolvedDemoGraph, removed: RemovedContent): void {
  const line = '═'.repeat(78);
  const thin = '─'.repeat(78);

  console.log(`\n${line}`);
  console.log('  SEMILLA DE DEMOSTRACIÓN — VozLab');
  console.log(`  workspace ${WORKSPACE_ID} · base de datos ${tenantConfig.database}`);
  console.log(`${line}\n`);

  // --- What the reset removed --------------------------------------------
  console.log('⚠  RESET DEL WORKSPACE — se eliminó el contenido que no es de la semilla');
  console.log(`   nodos eliminados         ${removed.nodes.length}`);
  console.log(`   relaciones eliminadas    ${removed.edges}`);
  console.log(`   propuestas eliminadas    ${removed.proposals}`);
  console.log(`   hilos eliminados         ${removed.threads}`);
  console.log(`   mensajes eliminados      ${removed.posts}`);
  console.log(`   votos eliminados         ${removed.votes}`);
  if (removed.nodes.length > 0) {
    console.log('   ejemplos de nodos eliminados:');
    for (const node of removed.nodes.slice(0, 5)) {
      console.log(`     · ${shorten(node.title, 66)}`);
    }
    if (removed.nodes.length > 5) {
      console.log(`     … y ${removed.nodes.length - 5} más`);
    }
  }
  console.log('');

  // --- The clusters -------------------------------------------------------
  const titleById = new Map(graph.nodes.map((node) => [node.id, node.title]));
  const labelById = new Map(
    graph.nodes.map((node) => [
      node.id,
      `${clusterShort(node.cluster)}.${node.key.toUpperCase()}`,
    ])
  );

  for (const cluster of graph.clusters) {
    console.log(`${thin}`);
    console.log(`  CLUSTRE ${clusterShort(cluster.key).toUpperCase()} · ${cluster.label}`);
    console.log(`  ${cluster.summary}`);
    console.log(`${thin}`);

    for (const [typeKey, typeLabel] of [
      ['Problem', 'Problemas'],
      ['Idea', 'Ideas'],
      ['Resource', 'Recursos'],
    ] as const) {
      const ofType = cluster.nodes.filter((node) => node.typeKey === typeKey);
      console.log(`\n  ${typeLabel} (${ofType.length})`);
      for (const node of ofType) {
        const attributes = Object.entries(node.attributes)
          .map(([key, value]) => `${key}=${value}`)
          .join(' · ');
        console.log(
          `    ${labelById.get(node.id)}  ${shorten(node.title, 60)}`
        );
        console.log(`         ${attributes} · ${node.createdAt.slice(0, 10)}`);
      }
    }

    console.log(`\n  Relaciones (${cluster.edges.length})`);
    for (const edge of cluster.edges) {
      console.log(
        `    ${labelById.get(edge.fromNodeId)} --${relationLabel(edge.relationKey)}--> ` +
          `${labelById.get(edge.toNodeId)}   ` +
          `${shorten(titleById.get(edge.fromNodeId) ?? '', 30)} → ` +
          `${shorten(titleById.get(edge.toNodeId) ?? '', 30)}`
      );
    }
    console.log('');
  }

  // --- The bridges --------------------------------------------------------
  const bridges = graph.edges.filter((edge) => edge.bridge);
  console.log(`${thin}`);
  console.log(`  PUENTES ENTRE CLUSTRES (${bridges.length})`);
  console.log(`${thin}`);
  for (const bridge of bridges) {
    console.log(
      `    ${labelById.get(bridge.fromNodeId)} (${clusterLabel(bridge.fromCluster)}) ` +
        `--${relationLabel(bridge.relationKey)}--> ` +
        `${labelById.get(bridge.toNodeId)} (${clusterLabel(bridge.toCluster)})`
    );
  }
  console.log('');

  // --- Governance ---------------------------------------------------------
  console.log(`${thin}`);
  console.log('  GOBERNANZA');
  console.log(`${thin}`);
  console.log(
    '  Las propuestas las escribe el miembro (member); solo quien mantiene el nodo\n' +
      '  (el maintainer) puede aprobarlas. El moderador puede aplicar a mano una\n' +
      '  propuesta vieja y muy votada.\n'
  );
  console.log(`  Propuestas (${graph.proposals.length})`);
  for (const proposal of graph.proposals) {
    const target = graph.nodes.find((node) => node.id === proposal.targetId);
    const state =
      proposal.status === 'PENDING' ? 'PENDING            ' : 'APPROVED_BY_AUTHOR';
    const age = Math.floor(
      (Date.now() - Date.parse(proposal.createdAt)) / (1000 * 60 * 60 * 24)
    );
    console.log(
      `    ${proposal.key.padEnd(13)} ${state}  ${String(proposal.communityScore).padStart(3)} votos · ${String(age).padStart(3)} días`
    );
    console.log(`      sobre ${labelById.get(proposal.targetId)} · ${shorten(target?.title ?? '', 58)}`);
    console.log(`     .delta: ${Object.keys(proposal.proposedChanges).join(', ')}`);
  }

  const nested = graph.posts.filter((post) => post.parentPostId !== null).length;
  console.log(`\n  Hilos de discusión (${graph.threads.length}) con ${graph.posts.length} mensajes (${nested} respuestas anidadas)`);
  for (const thread of graph.threads) {
    const posts = graph.posts.filter((post) => post.threadId === thread.id);
    console.log(
      `    ${thread.key}  [${thread.targetType}] ${shorten(thread.title, 60)}  (${posts.length} mensajes)`
    );
  }

  console.log(`\n  Votos registrados (${graph.votes.length})`);
  const byType = new Map<string, number>();
  const byIdentity = new Map<string, number>();
  const identityOf = new Map(
    DEV_IDENTITY_NAMES.map((name) => [DEV_IDENTITIES[name].authorHash, name])
  );
  for (const vote of graph.votes) {
    byType.set(vote.targetType, (byType.get(vote.targetType) ?? 0) + 1);
    const identity = identityOf.get(vote.userHash) ?? 'desconocida';
    byIdentity.set(identity, (byIdentity.get(identity) ?? 0) + 1);
  }
  for (const [type, count] of byType) {
    console.log(`    ${type.padEnd(9)} ${count}`);
  }
  console.log(
    `    por identidad  ${[...byIdentity.entries()]
      .map(([identity, count]) => `${identity} ${count}`)
      .join(' · ')}`
  );
  console.log('');

  // --- Ontology -----------------------------------------------------------
  console.log(`${thin}`);
  console.log('  ONTOLOGÍA ACTIVA');
  console.log(`${thin}`);
  console.log('  Relaciones  RELATES_TO (Problema→Idea) · INVOLVES (Problema→Problema)');
  console.log('              ADDRESSES (Idea→Problema) · BUILDS_ON (Idea→Idea) · EVIDENCED_BY (Problema→Recurso)');
  console.log('  Atributos   sector, alcance (Problema) · horizonte, costoEstimado (Idea)');
  console.log('              enlace, tipoFuente (Recurso)');
  console.log('');

  // --- How to open the demo ----------------------------------------------
  console.log(`${line}`);
  console.log('  LISTO PARA LA DEMOSTRACIÓN');
  console.log(`${line}`);
  console.log(
    `\n  ${graph.nodes.length} nodos · ${graph.edges.length} relaciones · ` +
      `${graph.proposals.length} propuestas · ${graph.threads.length} hilos · ` +
      `${graph.posts.length} mensajes · ${graph.votes.length} votos`
  );
  console.log(
    '\n  Entra como maintainer (es quien puede aprobar las propuestas):\n' +
      '    pnpm --filter @vozlab/database db:mint-token -- --as maintainer\n' +
      `    X-Workspace-ID: ${WORKSPACE_ID}\n`
  );
}

/** `RELATES_TO` → `se relaciona con`. */
function relationLabel(relationKey: DemoRelationKey): string {
  return RELATION_LABELS[relationKey] ?? relationKey;
}

/** `movilidad` → `M1` (the short name of a cluster in the report). */
function clusterShort(cluster: DemoClusterKey): string {
  switch (cluster) {
    case 'movilidad':
      return 'M';
    case 'espacios':
      return 'E';
    case 'academico':
      return 'A';
  }
}

/** `movilidad` → `movilidad`. */
function clusterLabel(cluster: DemoClusterKey): string {
  const found = DEMO_CLUSTERS.find((candidate) => candidate.key === cluster);
  return found?.label ?? cluster;
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
        '  pnpm --filter @vozlab/database db:migrate\n',
    );
    process.exit(1);
  });
