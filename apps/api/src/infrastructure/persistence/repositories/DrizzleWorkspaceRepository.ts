import { and, eq, notExists, sql } from 'drizzle-orm';
import { workspaces, workspaceMemberships } from '@vozlab/database';
import {
  CreateWorkspaceRecordInput,
  DiscoveredWorkspace,
  IWorkspaceRepository,
  UpdateWorkspacePatch,
  WorkspaceRecord,
  WorkspaceWithStats,
} from '../../../domain/ports/IWorkspaceRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

type WorkspaceRow = typeof workspaces.$inferSelect;

function toWorkspace(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    kind: row.kind,
    joinCode: row.joinCode,
    createdAt: row.createdAt,
  };
}

function toWorkspaceWithStats(row: WorkspaceRow & {
  memberCount: number;
  pendingRequestCount: number;
}): WorkspaceWithStats {
  return {
    ...toWorkspace(row),
    memberCount: Number(row.memberCount),
    pendingRequestCount: Number(row.pendingRequestCount),
  };
}

/** Counters correlated with the workspace row; they keep the list to one query. */
const memberCountSql = sql<number>`(
  select count(*)::int from auth.workspace_memberships wm
  where wm.workspace_id = ${workspaces.id} and wm.status = 'ACTIVE'
)`;

const pendingRequestCountSql = sql<number>`(
  select count(*)::int from auth.workspace_join_requests jr
  where jr.workspace_id = ${workspaces.id} and jr.status = 'PENDING'
)`;

export class DrizzleWorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async create(
    input: CreateWorkspaceRecordInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceRecord> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .insert(workspaces)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description,
        isPublic: input.isPublic,
        kind: input.kind ?? 'PRIVATE',
        joinCode: input.joinCode,
      })
      .returning();
    return toWorkspace(row);
  }

  async update(
    workspaceId: string,
    patch: UpdateWorkspacePatch,
    tid: string,
    tx?: DbTransaction
  ): Promise<WorkspaceRecord | null> {
    const db = await this.client(tid, tx);
    const values: Partial<typeof workspaces.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.isPublic !== undefined) values.isPublic = patch.isPublic;
    if (patch.joinCode !== undefined) values.joinCode = patch.joinCode;
    if (Object.keys(values).length === 0) {
      const existing = await this.findById(workspaceId, tid);
      return existing;
    }

    const [row] = await db
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return row ? toWorkspace(row) : null;
  }

  async lockById(
    workspaceId: string,
    tid: string,
    tx: DbTransaction
  ): Promise<WorkspaceRecord | null> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update')
      .limit(1);
    return row ? toWorkspace(row) : null;
  }

  async findById(workspaceId: string, tid: string): Promise<WorkspaceRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return row ? toWorkspace(row) : null;
  }

  async findBySlug(slug: string, tid: string): Promise<WorkspaceRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    return row ? toWorkspace(row) : null;
  }

  async findByJoinCode(joinCode: string, tid: string): Promise<WorkspaceRecord | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.joinCode, joinCode.trim().toUpperCase()))
      .limit(1);
    return row ? toWorkspace(row) : null;
  }

  async listWithStats(tid: string): Promise<WorkspaceWithStats[]> {
    const db = await this.client(tid);
    const rows = await db
      .select({
        ...this.columns(),
        memberCount: memberCountSql,
        pendingRequestCount: pendingRequestCountSql,
      })
      .from(workspaces)
      .orderBy(workspaces.name);
    return rows.map(toWorkspaceWithStats);
  }

  async getStats(
    workspaceId: string,
    tid: string
  ): Promise<WorkspaceWithStats | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select({
        ...this.columns(),
        memberCount: memberCountSql,
        pendingRequestCount: pendingRequestCountSql,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return row ? toWorkspaceWithStats(row) : null;
  }

  async listPublicForUser(
    tid: string,
    userId: string
  ): Promise<DiscoveredWorkspace[]> {
    const db = await this.client(tid);
    const activeMembership = db
      .select({ one: sql`1` })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaces.id),
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, 'ACTIVE')
        )
      );

    const rows = await db
      .select({
        ...this.columns(),
        pendingRequest: sql<boolean>`exists (
          select 1 from auth.workspace_join_requests jr
          where jr.workspace_id = ${workspaces.id}
            and jr.user_id = ${userId}
            and jr.status = 'PENDING'
        )`,
      })
      .from(workspaces)
      .where(
        and(eq(workspaces.isPublic, true), notExists(activeMembership))
      )
      .orderBy(workspaces.name);

    return rows.map((row) => ({
      ...toWorkspace(row),
      pendingRequest: Boolean(row.pendingRequest),
    }));
  }

  /** The explicit column map keeps the correlated counters typed. */
  private columns() {
    return {
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      description: workspaces.description,
      isPublic: workspaces.isPublic,
      kind: workspaces.kind,
      joinCode: workspaces.joinCode,
      createdAt: workspaces.createdAt,
    };
  }
}
