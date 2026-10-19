import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { AuthUser, IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IEventCodeRepository } from '../../domain/ports/IEventCodeRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { ITokenIssuer } from '../../domain/ports/ITokenIssuer.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';

export interface JoinEventInput {
  code: string;
  alias?: string;
}

export interface JoinEventResult {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

/**
 * Redeem a global event code and create an anonymous workspace member.
 *
 * The code is consumed before the tenant transaction because capacity is a
 * router-DB concern; a tenant-DB failure can therefore burn one slot. That is
 * an accepted trade-off for a simple, race-free global registry (ADR-0019).
 */
export class JoinEventUseCase {
  constructor(
    private readonly eventCodeRepo: IEventCodeRepository,
    private readonly routerDb: IRouterDatabase,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly tokenIssuer: ITokenIssuer,
    private readonly uow: IUnitOfWork,
    private readonly refreshTtlMs: number
  ) {}

  async execute(input: JoinEventInput): Promise<JoinEventResult> {
    const consumption = await this.eventCodeRepo.consume(
      hashOpaqueToken(input.code)
    );

    if (consumption.status === 'NOT_FOUND' ||
        consumption.status === 'EXPIRED' ||
        consumption.status === 'REVOKED') {
      throw new DomainError('ERR_EVENT_EXPIRED');
    }
    if (consumption.status === 'FULL') {
      throw new DomainError('ERR_EVENT_FULL');
    }

    const tenant = await this.routerDb.findTenantById(
      consumption.code.tenantId
    );
    if (!tenant) {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const alias =
      input.alias?.trim() || `Anonymous ${randomBytes(3).toString('hex')}`;
    const authorHash = generateAuthorHash();
    const refreshToken = generateRefreshToken(tenant.id);
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const familyId = randomUUID();

    const user = await this.uow.runInTransaction(tenant.id, async (tx) => {
      const created = await this.userRepo.createAnonymousUser(
        { alias, authorHash },
        tenant.id,
        tx
      );

      await this.membershipRepo.add(
        created.id,
        consumption.code.workspaceId,
        'MEMBER',
        tenant.id,
        tx
      );

      await this.refreshRepo.create(
        {
          userId: created.id,
          familyId,
          tokenHash: hashOpaqueToken(refreshToken),
          expiresAt: refreshExpiresAt,
        },
        tenant.id,
        tx
      );

      return created;
    });

    const access = this.tokenIssuer.issue({
      userId: user.id,
      tenantKey: tenant.oidcTenantId,
      authorHash: user.authorHash,
    });

    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
      user,
    };
  }
}
