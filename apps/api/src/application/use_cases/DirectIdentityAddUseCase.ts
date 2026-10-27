import { randomBytes } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IGlobalIdentityRepository } from '../../domain/ports/IGlobalIdentityRepository.js';
import { IUserRepository, NewExternalIdentityInput } from '../../domain/ports/IUserRepository.js';
import { IMembershipRepository } from '../../domain/ports/IMembershipRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { generateAuthorHash } from '../../shared/auth/refreshToken.js';

export interface DirectIdentityAddInput {
  globalIdentityId: string;
  workspaceId: string;
  role: string;
  tid: string;
}

export interface DirectIdentityAddResult {
  userId: string;
  globalIdentityId: string;
  workspaceId: string;
  role: string;
}

export class DirectIdentityAddUseCase {
  constructor(
    private readonly globalIdentityRepo: IGlobalIdentityRepository,
    private readonly routerDb: IRouterDatabase,
    private readonly userRepo: IUserRepository,
    private readonly membershipRepo: IMembershipRepository
  ) {}

  async execute(input: DirectIdentityAddInput): Promise<DirectIdentityAddResult> {
    // 1. Verify the global identity exists.
    const globalIdentity = await this.globalIdentityRepo.findById(
      input.globalIdentityId
    );
    if (!globalIdentity) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'global identity not found');
    }

    // 2. Find or create local user via external identity.
    const user = await this.userRepo.findOrCreateByExternalIdentity(
      {
        issuer: globalIdentity.issuer,
        subject: globalIdentity.subject,
        email: null,
        emailVerified: null,
        fullName: null,
        authorHash: generateAuthorHash(),
        globalIdentityId: globalIdentity.id,
      },
      input.tid
    );

    // findOrCreateByExternalIdentity always returns a user or throws.
    if (!user) {
      throw new DomainError('ERR_VALIDATION_FAILED', 'failed to create user');
    }

    // 3. Create membership with INVITED status.
    await this.membershipRepo.add(
      user.id,
      input.workspaceId,
      input.role as any,
      input.tid
    );

    return {
      userId: user.id,
      globalIdentityId: globalIdentity.id,
      workspaceId: input.workspaceId,
      role: input.role,
    };
  }
}