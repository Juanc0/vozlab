import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalUserRepository, GlobalUser } from '../../domain/ports/IGlobalUserRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { generateAuthorHash, generateRefreshToken, hashOpaqueToken } from '../../shared/auth/refreshToken.js';
import { AuthUser } from '../../domain/ports/IUserRepository.js';

export interface SelectTenantInput {
  globalIdentityId: string;
  tenantId: string;
  refreshTtlMs: number;
}

export interface SelectTenantResult {
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

export class SelectTenantUseCase {
  constructor(
    private readonly globalUserRepo: IGlobalUserRepository,
    private readonly routerDb: IRouterDatabase,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork,
    private readonly refreshRepo: IRefreshTokenRepository
  ) {}

  async execute(input: SelectTenantInput): Promise<SelectTenantResult> {
    const identity = await this.globalUserRepo.findById(input.globalIdentityId);
    if (!identity) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'global identity not found');
    }

    const tenants = await this.routerDb.findTenantsByGlobalUser(input.globalIdentityId);
    const link = tenants.find((t) => t.id === input.tenantId);
    if (!link || link.status !== 'ACTIVE') {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const tenant = await this.routerDb.findTenantById(input.tenantId);
    if (!tenant) {
      throw new DomainError('ERR_TENANT_NOT_PROVISIONED');
    }

    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        emailVerified: identity.emailVerified,
        fullName: identity.fullName,
        authorHash: generateAuthorHash(),
        globalIdentityId: identity.id,
      },
      tenant.id
    );

    const refreshToken = generateRefreshToken(tenant.id);
    const refreshExpiresAt = new Date(Date.now() + input.refreshTtlMs);

    await this.refreshRepo.create(
      {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashOpaqueToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
      tenant.id
    );

    return { refreshToken, refreshExpiresAt, user };
  }
}