import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { refreshTokens } from '@vozlab/database';
import {
  CreateRefreshTokenInput,
  IRefreshTokenRepository,
  RotateRefreshTokenInput,
  RotateRefreshTokenResult,
} from '../../../domain/ports/IRefreshTokenRepository.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';
import { log } from '../../../shared/logger/index.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

/** Keep rotated/revoked rows long enough to detect credential theft. */
const REUSE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Drizzle adapter for rotating refresh sessions.
 *
 * Rotation is an atomic conditional UPDATE inside a transaction. Two
 * concurrent requests with the same token cannot both receive a new session:
 * the second sees zero updated rows and is treated as token reuse.
 */
export class DrizzleRefreshTokenRepository
  implements IRefreshTokenRepository
{
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async create(
    input: CreateRefreshTokenInput,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    try {
      const db = await this.client(tid, tx);
      await db.insert(refreshTokens).values({
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      log.error({ err: error, userId: input.userId }, 'failed to create refresh token');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async rotate(
    input: RotateRefreshTokenInput,
    tid: string
  ): Promise<RotateRefreshTokenResult> {
    try {
      const db = await this.poolManager.getDb(tid);
      return await db.transaction(async (tx) => {
        const now = new Date();

        const [rotated] = await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(refreshTokens.tokenHash, input.oldTokenHash),
              isNull(refreshTokens.revokedAt),
              gt(refreshTokens.expiresAt, now)
            )
          )
          .returning({
            userId: refreshTokens.userId,
            familyId: refreshTokens.familyId,
          });

        if (!rotated) {
          const [existing] = await tx
            .select({
              familyId: refreshTokens.familyId,
              revokedAt: refreshTokens.revokedAt,
            })
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, input.oldTokenHash))
            .limit(1);

          if (!existing) return { status: 'INVALID' } as const;
          if (!existing.revokedAt) return { status: 'INVALID' } as const;

          // Reuse of a rotated token: assume theft and revoke the family.
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(
              and(
                eq(refreshTokens.familyId, existing.familyId),
                isNull(refreshTokens.revokedAt)
              )
            );
          log.warn({ familyId: existing.familyId }, 'refresh token reuse detected');
          return { status: 'REUSED', familyId: existing.familyId } as const;
        }

        await tx.insert(refreshTokens).values({
          userId: rotated.userId,
          familyId: rotated.familyId,
          tokenHash: input.newTokenHash,
          expiresAt: input.newExpiresAt,
        });

        // Bound table growth per user: drop expired rows and revoked rows
        // older than the reuse-detection window.
        const cutoff = new Date(now.getTime() - REUSE_RETENTION_MS);
        await tx
          .delete(refreshTokens)
          .where(
            and(
              eq(refreshTokens.userId, rotated.userId),
              or(
                lt(refreshTokens.expiresAt, now),
                and(
                  isNotNull(refreshTokens.revokedAt),
                  lt(refreshTokens.revokedAt, cutoff)
                )
              )
            )
          );

        return {
          status: 'OK',
          userId: rotated.userId,
          familyId: rotated.familyId,
        } as const;
      });
    } catch (error) {
      log.error({ err: error }, 'failed to rotate refresh token');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async revokeFamilyByHash(tokenHash: string, tid: string): Promise<void> {
    try {
      const db = await this.poolManager.getDb(tid);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ familyId: refreshTokens.familyId })
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, tokenHash))
          .limit(1);

        if (!row) return;

        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(refreshTokens.familyId, row.familyId),
              isNull(refreshTokens.revokedAt)
            )
          );
      });
    } catch (error) {
      log.error({ err: error }, 'failed to revoke refresh family');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }

  async revokeFamily(familyId: string, tid: string): Promise<void> {
    try {
      const db = await this.poolManager.getDb(tid);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.familyId, familyId),
            isNull(refreshTokens.revokedAt)
          )
        );
    } catch (error) {
      log.error({ err: error, familyId }, 'failed to revoke refresh family');
      throw new InfrastructureError('ERR_DATABASE_CONNECTION_FAILED');
    }
  }
}
