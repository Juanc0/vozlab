import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalIdentityRepository } from '../../domain/ports/IGlobalIdentityRepository.js';

export interface ResolveTenantsInput {
  globalIdentityId: string;
}

export interface ResolvedTenant {
  id: string;
  slug: string;
  oidcTenantId: string;
  status: string;
}

export class ResolveTenantsUseCase {
  constructor(
    private readonly globalIdentityRepo: IGlobalIdentityRepository,
    private readonly routerDb: IRouterDatabase
  ) {}

  async execute(input: ResolveTenantsInput): Promise<ResolvedTenant[]> {
    const identity = await this.globalIdentityRepo.findById(input.globalIdentityId);
    if (!identity) {
      throw new Error('global identity not found');
    }
    return this.routerDb.findTenantsByGlobalIdentity(input.globalIdentityId);
  }
}