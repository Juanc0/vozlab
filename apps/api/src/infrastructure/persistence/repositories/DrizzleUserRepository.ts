import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';
import { users, workspaceMemberships, workspaces, externalIdentities } from '@vozlab/database';
import { WorkspaceRole } from '@vozlab/shared-types';
import {
  AuthProvider,
  AuthUser,
  IUserRepository,
  NewAnonymousUser,
  NewExternalIdentityInput,
  UserWorkspace,
} from '../../../domain/ports/IUserRepository.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';
import { log } from '../../../shared/logger/index.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

type UserRow = typeof users.$inferSelect;

/** Role strength for the picker dedup (strongest wins). */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  GUEST: 0,
  MEMBER: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

/**
 * Collapse multiple ACTIVE membership rows for the same workspace into a
 * single entry carrying the strongest role (ADMIN > MODERATOR > MEMBER >
 * GUEST). Pure helper, exported for unit testing.
 */
export function collapseWorkspacesByStrongestRole<T extends { id: string; role: WorkspaceRole }>(
  rows: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const current = byId.get(row.id);
    if (!current || ROLE_RANK[row.role] > ROLE_RANK[current.role]) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    fullName: row.fullName,
    provider: row.provider as AuthProvider,
    authorHash: row.authorHash,
    anonymousAlias: row.anonymousAlias,
    systemRole: row.systemRole,
    sessionsValidAfter: row.sessionsValidAfter,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Drizzle adapter for `auth.users` and the workspace list.
 *
 * DEC-5 D5: the tenant row stores no email at all. The identity key is
 * `external_identities(issuer, subject)`; account linking by verified email
 * lives in the router vault (`global_users.email_hash`), never here. It
 * never links an `ANONYMOUS_EVENT` row: those users must not be taken over
 * by an institutional login.
 */
export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findById(userId: string, tid: string): Promise<AuthUser | null> {
    try {
      const db = await this.client(tid);
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ? toAuthUser(row) : null;
    } catch (error) {
      log.error({ err: error, userId }, 'failed to find auth user');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async findByHandle(handle: string, tid: string): Promise<AuthUser | null> {
    try {
      const db = await this.client(tid);
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.handle, handle))
        .limit(1);
      return row ? toAuthUser(row) : null;
    } catch (error) {
      log.error({ err: error, handle }, 'failed to find auth user by handle');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * B14: the handle is a lookup alias, not a credential. If the derived
   * handle is already claimed by a different account (two users sharing an
   * email local-part across IdPs), the row is created/repaired without one
   * — login must never fail over an alias collision.
   */
  private async freeHandle(
    tx: Tx,
    handle: string | null | undefined,
    selfId?: string
  ): Promise<string | null> {
    if (!handle) return null;
    const [taken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        selfId
          ? and(eq(users.handle, handle), ne(users.id, selfId))
          : eq(users.handle, handle)
      )
      .limit(1);
    return taken ? null : handle;
  }

  async findOrCreateByExternalIdentity(
    input: NewExternalIdentityInput,
    tid: string
  ): Promise<AuthUser> {
    const db = await this.poolManager.getDb(tid);

    try {
      return await db.transaction(async (tx) => {
        // 1. Look up by (issuer, subject) in external_identities.
        const [existingExt] = await tx
          .select()
          .from(externalIdentities)
          .where(
            and(
              eq(externalIdentities.issuer, input.issuer),
              eq(externalIdentities.subject, input.subject)
            )
          )
          .limit(1);

        if (existingExt) {
          // Update profile and last login. B14 repair: a JIT user created
          // before the handle derivation existed gets its alias now — but a
          // handle already set is never overwritten, and one taken by
          // another account is dropped (alias collision must not break the
          // login: the handle is a lookup key, not a credential).
          const freeHandle = await this.freeHandle(tx, input.handle, existingExt.userId);
          const [updated] = await tx
            .update(users)
            .set({
              fullName: input.fullName ?? undefined,
              handle: sql`COALESCE(${users.handle}, ${freeHandle})`,
            })
            .where(eq(users.id, existingExt.userId))
            .returning();
          await tx
            .update(externalIdentities)
            .set({ lastLoginAt: new Date() })
            .where(eq(externalIdentities.id, existingExt.id));
          const [user] = updated
            ? [updated]
            : await tx
                .select()
                .from(users)
                .where(eq(users.id, existingExt.userId))
                .limit(1);
          return toAuthUser(user!);
        }

        // 2. Create new user + external_identity row. The handle is the
        // admin's direct-add alias (B14); a collision with another account's
        // handle is tolerated by leaving the row NULL rather than failing
        // the login — the identity key is (issuer, subject).
        const freeHandle = await this.freeHandle(tx, input.handle);
        const [created] = await tx
          .insert(users)
          .values({
            provider: 'OIDC_INSTITUTIONAL',
            fullName: input.fullName,
            handle: freeHandle,
            authorHash: input.authorHash,
            systemRole: 'USER',
            globalUserId: input.globalUserId ?? null,
          })
          .returning();

        if (!created) {
          throw new DomainError(
            'ERR_ACCOUNT_LINK_CONFLICT',
            'concurrent account creation conflict'
          );
        }

        await tx.insert(externalIdentities).values({
          userId: created.id,
          issuer: input.issuer,
          subject: input.subject,
          providerKind: 'OIDC_INSTITUTIONAL',
        });

        return toAuthUser(created);
      });
    } catch (error) {
      if (
        error instanceof DomainError ||
        error instanceof InfrastructureError
      ) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new DomainError('ERR_ACCOUNT_LINK_CONFLICT');
      }
      log.error({ err: error }, 'failed to upsert external identity');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async createAnonymousUser(
    input: NewAnonymousUser,
    tid: string,
    tx?: DbTransaction
  ): Promise<AuthUser> {
    try {
      const db = await this.client(tid, tx);
      const [created] = await db
        .insert(users)
        .values({
          provider: 'ANONYMOUS_EVENT',
          fullName: null,
          authorHash: input.authorHash,
          anonymousAlias: input.alias,
          systemRole: 'USER',
        })
        .returning();

      if (!created) {
        throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
      }
      return toAuthUser(created);
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      log.error({ err: error }, 'failed to create anonymous user');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async listWorkspaces(userId: string, tid: string): Promise<UserWorkspace[]> {
    try {
      const db = await this.poolManager.getDb(tid);
      const rows = await db
        .select({
          id: workspaces.id,
          slug: workspaces.slug,
          name: workspaces.name,
          role: workspaceMemberships.role,
        })
        .from(workspaceMemberships)
        .innerJoin(
          workspaces,
          eq(workspaceMemberships.workspaceId, workspaces.id)
        )
        // Audit P3: the picker is a security surface — a REMOVED or SUSPENDED
        // membership must disappear from `/auth/me` together with its stale
        // role. (The admin screen's `listByWorkspace` deliberately shows all
        // statuses; see audit §3.)
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.status, 'ACTIVE')
          )
        )
        .orderBy(asc(workspaces.name));

      // v5: a user may hold several roles in one workspace. The picker shows
      // one entry per workspace with the strongest ACTIVE role.
      const collapsed = collapseWorkspacesByStrongestRole(
        rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          role: row.role as WorkspaceRole,
        }))
      );

      return collapsed;
    } catch (error) {
      log.error({ err: error, userId }, 'failed to list user workspaces');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  /**
   * v6/TASK-09 (B7): delete anonymous event guests inactive since `cutoff`.
   *
   * P2 fix (identity-consolidation T7, D-4 ruling): the guests are selected
   * by `provider = 'ANONYMOUS_EVENT'` — the single discriminator. The filter
   * used to be `is_anonymous = TRUE`, a column no writer ever set, which made
   * this sweep silently delete nothing since inception.
   *
   * Inactivity is the absence of **every** signal the tenant DB carries:
   * the account creation, any membership row, any `membership_events` row
   * for the user, and any refresh-token issuance (rotation is the only
   * record of a guest actually using the session). The account-level
   * `created_at` alone is not enough: a guest re-joining an event later
   * leaves a fresh membership or token behind.
   *
   * `membership_events` has no FK to `users`, so the audit trail survives
   * the delete by design; graph authorship is an opaque `author_hash` and
   * is not touched either.
   */
  async removeInactiveGuests(tid: string, cutoff: Date, tx?: DbTransaction): Promise<number> {
    try {
      const db = (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
      const removed = await db
        .delete(users)
        .where(
          and(
            eq(users.provider, 'ANONYMOUS_EVENT'),
            lt(users.createdAt, cutoff),
            sql`not exists (
                   select 1 from ${workspaceMemberships} m
                   where m.user_id = ${users.id} and m.created_at >= ${cutoff}
                 )`,
            sql`not exists (
                   select 1 from auth.membership_events e
                   where e.user_id = ${users.id} and e.created_at >= ${cutoff}
                 )`,
            sql`not exists (
                   select 1 from auth.refresh_tokens r
                   where r.user_id = ${users.id} and r.created_at >= ${cutoff}
                 )`
          )
        )
        .returning({ id: users.id });
      return removed.length;
    } catch (error) {
      log.error({ err: error, tid }, 'failed to remove inactive guests');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async updateSystemRole(
    userId: string,
    systemRole: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<AuthUser> {
    try {
      const db = await this.client(tid, tx);
      const [row] = await db
        .update(users)
        .set({ systemRole })
        .where(eq(users.id, userId))
        .returning();
      if (!row) throw new DomainError('ERR_USER_NOT_FOUND');
      return toAuthUser(row);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      log.error({ err: error, userId }, 'failed to update system role');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async setSessionsValidAfter(
    userId: string,
    value: Date | null,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    try {
      const db = await this.client(tid, tx);
      const updated = await db
        .update(users)
        .set({ sessionsValidAfter: value })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (updated.length === 0) throw new DomainError('ERR_USER_NOT_FOUND');
    } catch (error) {
      if (error instanceof DomainError) throw error;
      log.error({ err: error, userId }, 'failed to set sessionsValidAfter');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async countSystemAdmins(tid: string, tx?: DbTransaction): Promise<number> {
    try {
      const db = await this.client(tid, tx);
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.systemRole, 'ADMIN'));
      return row?.count ?? 0;
    } catch (error) {
      log.error({ err: error, tid }, 'failed to count system admins');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }
}
