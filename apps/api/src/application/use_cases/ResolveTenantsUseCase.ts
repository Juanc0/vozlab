import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';
import { IGlobalUserRepository } from '../../domain/ports/IGlobalUserRepository.js';

export interface ResolveTenantsInput {
  globalUserId: string;
}

export interface ResolvedTenant {
  id: string;
  slug: string;
  oidcTenantId: string;
  status: string;
}

export class ResolveTenantsUseCase {
  constructor(
    private readonly globalUserRepo: IGlobalUserRepository,
    private readonly routerDb: IRouterDatabase
  ) {}

  async execute(input: ResolveTenantsInput): Promise<ResolvedTenant[]> {
    const globalUser = await this.globalUserRepo.findById(input.globalUserId);
    if (!globalUser) {
      throw new Error('global identity not found');
    }
    return this.routerDb.findTenantsByGlobalUser(input.globalUserId);
  }
}