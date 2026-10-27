import { and, asc, eq } from 'drizzle-orm';
import { users, workspaceMemberships, workspaces, externalIdentities } from '@vozlab/database';
import { WorkspaceRole } from '@vozlab/shared-types';
import {
  AuthProvider,
  AuthUser,
  IUserRepository,
  NewAnonymousUser,
  NewOidcUser,
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

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    provider: row.provider as AuthProvider,
    providerUserId: row.providerUserId,
    authorHash: row.authorHash,
    anonymousAlias: row.anonymousAlias,
    systemRole: row.systemRole,
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
 * The OIDC upsert links an existing row by verified email when the IdP subject
 * changes (standard account-linking behaviour). It never links an
 * `ANONYMOUS_EVENT` row: those users have no email and must not be taken over
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

  async findOrCreateOidcUser(
    input: NewOidcUser,
    tid: string
  ): Promise<AuthUser> {
    const db = await this.poolManager.getDb(tid);

    try {
      return await db.transaction(async (tx) => {
        const [byProvider] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.provider, 'OIDC_INSTITUTIONAL'),
              eq(users.providerUserId, input.providerUserId)
            )
          )
          .limit(1);

        if (byProvider) {
          const [updated] = await tx
            .update(users)
            .set({
              email: input.email ?? byProvider.email,
              fullName: input.fullName ?? byProvider.fullName,
            })
            .where(eq(users.id, byProvider.id))
            .returning();
          return toAuthUser(updated ?? byProvider);
        }

        if (input.email && input.emailVerified === true) {
          const [byEmail] = await tx
            .select()
            .from(users)
            .where(eq(users.email, input.email))
            .limit(1);

          if (byEmail) {
            if (byEmail.provider !== 'OIDC_INSTITUTIONAL') {
              throw new DomainError(
                'ERR_ACCOUNT_LINK_CONFLICT',
                'email belongs to a non-OIDC account'
              );
            }
            // Verified institutional email: link the new IdP subject.
            const [linked] = await tx
              .update(users)
              .set({
                providerUserId: input.providerUserId,
                fullName: input.fullName ?? byEmail.fullName,
              })
              .where(eq(users.id, byEmail.id))
              .returning();
            return toAuthUser(linked ?? byEmail);
          }
        }

        const [created] = await tx
          .insert(users)
          .values({
            provider: 'OIDC_INSTITUTIONAL',
            providerUserId: input.providerUserId,
            email: input.email,
            fullName: input.fullName,
            authorHash: input.authorHash,
            systemRole: 'USER',
          })
          .onConflictDoNothing()
          .returning();

        if (created) return toAuthUser(created);

        // Lost a concurrent insert race: re-read the winner.
        const [raced] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.provider, 'OIDC_INSTITUTIONAL'),
              eq(users.providerUserId, input.providerUserId)
            )
          )
          .limit(1);
        if (raced) return toAuthUser(raced);

        throw new DomainError(
          'ERR_ACCOUNT_LINK_CONFLICT',
          'concurrent account creation conflict'
        );
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
      log.error({ err: error }, 'failed to upsert OIDC user');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
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
          // Update profile and last login.
          const [updated] = await tx
            .update(users)
            .set({
              email: input.email ?? undefined,
              fullName: input.fullName ?? undefined,
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

        // 2. If email belongs to another account, conflict (no reassignment).
        if (input.email && input.emailVerified === true) {
          const [byEmail] = await tx
            .select()
            .from(users)
            .where(eq(users.email, input.email))
            .limit(1);

          if (byEmail) {
            throw new DomainError(
              'ERR_ACCOUNT_LINK_CONFLICT',
              'email belongs to a different identity'
            );
          }
        }

        // 3. Create new user + external_identity row.
        const [created] = await tx
          .insert(users)
          .values({
            provider: 'OIDC_INSTITUTIONAL',
            providerUserId: input.subject,
            email: input.email,
            fullName: input.fullName,
            authorHash: input.authorHash,
            systemRole: 'USER',
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
          providerUserId: null,
          email: null,
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
        .where(eq(workspaceMemberships.userId, userId))
        .orderBy(asc(workspaces.name));

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: row.role as WorkspaceRole,
      }));
    } catch (error) {
      log.error({ err: error, userId }, 'failed to list user workspaces');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }
}
