import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { users, workspaceMemberships, workspaces } from '@vozlab/database';
import {
  ITenantAdminRepository,
  ListTenantUsersInput,
  ListTenantUsersResult,
  TenantUserMembershipRecord,
  TenantUserRecord,
} from '../../../domain/ports/ITenantAdminRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { decodeCursor, encodeCursor, keysetAfter } from '../keyset.js';

type UserRow = typeof users.$inferSelect;

/**
 * DrizzleTenantAdminRepository: the read model of the tenant user list.
 *
 * The page of users is read first and the memberships of that page are read
 * in a second query keyed by `inArray`: two queries per page, never one per
 * user.
 */
export class DrizzleTenantAdminRepository implements ITenantAdminRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  async listUsers(
    input: ListTenantUsersInput,
    tid: string
  ): Promise<ListTenantUsersResult> {
    const db = await this.poolManager.getDb(tid);

    const filters = [];
    if (input.search !== undefined && input.search !== '') {
      const pattern = `%${input.search}%`;
      filters.push(
        or(ilike(users.email, pattern), ilike(users.fullName, pattern)) ??
          sql`false`
      );
    }
    if (input.cursor !== undefined && input.cursor !== '') {
      const decoded = decodeCursor(input.cursor);
      if (decoded !== null) {
        filters.push(keysetAfter(users.createdAt, users.id, decoded, 'desc'));
      }
    }

    const where = filters.length > 0 ? and(...filters) : undefined;
    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const memberships = await this.membershipsOf(
      page.map((row) => row.id),
      tid
    );
    const last = page[page.length - 1];

    return {
      users: page.map((row) => this.toRecord(row, memberships)),
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  async findUserByEmail(
    email: string,
    tid: string
  ): Promise<TenantUserRecord | null> {
    const db = await this.poolManager.getDb(tid);
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    if (!row) return null;
    const memberships = await this.membershipsOf([row.id], tid);
    return this.toRecord(row, memberships);
  }

  async findUserById(
    userId: string,
    tid: string
  ): Promise<TenantUserRecord | null> {
    const db = await this.poolManager.getDb(tid);
    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row) return null;
    const memberships = await this.membershipsOf([row.id], tid);
    return this.toRecord(row, memberships);
  }

  private async membershipsOf(
    userIds: string[],
    tid: string
  ): Promise<Map<string, TenantUserMembershipRecord[]>> {
    const result = new Map<string, TenantUserMembershipRecord[]>();
    if (userIds.length === 0) return result;

    const db = await this.poolManager.getDb(tid);
    const rows = await db
      .select({
        userId: workspaceMemberships.userId,
        workspaceId: workspaceMemberships.workspaceId,
        workspaceName: workspaces.name,
        role: workspaceMemberships.role,
        status: workspaceMemberships.status,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(inArray(workspaceMemberships.userId, userIds))
      .orderBy(workspaces.name);

    for (const row of rows) {
      const list = result.get(row.userId) ?? [];
      list.push({
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName,
        role: row.role,
        status: row.status,
      });
      result.set(row.userId, list);
    }
    return result;
  }

  private toRecord(
    row: UserRow,
    memberships: Map<string, TenantUserMembershipRecord[]>
  ): TenantUserRecord {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      provider: row.provider,
      systemRole: row.systemRole,
      authorHash: row.authorHash,
      createdAt: row.createdAt,
      memberships: memberships.get(row.id) ?? [],
    };
  }
}
