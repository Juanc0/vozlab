import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalUserRepository, GlobalUser } from '../../domain/ports/IGlobalUserRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IRefreshTokenRepository } from '../../domain/ports/IRefreshTokenRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import {
  generateAuthorHash,
  generateRefreshToken,
  hashOpaqueToken,
} from '../../shared/auth/refreshToken.js';
import { deriveHandle } from '../../shared/auth/deriveHandle.js';
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
    private readonly refreshRepo: IRefreshTokenRepository,
    /** B12: identity trail for the tenant selection (see `execute`). */
    private readonly audit?: IAuditLog
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
        // B14: this is where a multi-tenant login finally touches the
        // tenant DB — the handle repair of the JIT row (rows created before
        // the rule existed, or created through the selector path) happens
        // here. The router profile has no `preferred_username`, so the
        // email's local-part is the deterministic source.
        handle: deriveHandle({ email: identity.email, subject: identity.subject }),
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

    // B12: explicit identity trail. This use case backs both the tenant
    // selector (`/auth/select-tenant`) and the sidebar switch (`/auth/
    // switch-tenant`), so every entry into a tenant leaves one event on the
    // global identity — the selection is never an anonymous hop.
    await this.audit?.record({
      actorId: user.id,
      actorType: 'USER',
      action: 'TENANT_SELECTED',
      targetType: 'global_identity',
      targetId: input.globalIdentityId,
      tenantId: tenant.id,
      globalIdentityId: input.globalIdentityId,
      metadata: { tenantSlug: tenant.slug },
    });

    return { refreshToken, refreshExpiresAt, user };
  }
}