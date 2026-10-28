import {
  ITenantAdminRepository,
  ListTenantUsersInput,
  ListTenantUsersResult,
} from '../../domain/ports/ITenantAdminRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ListTenantUsersUseCaseInput extends ListTenantUsersInput {
  actorUserId: string;
  tid: string;
}

/**
 * Use Case: the tenant user directory (US-00).
 *
 * The memberships come with each user so an administrator can see, before
 * adding somebody, where they already belong.
 */
export class ListTenantUsersUseCase {
  constructor(
    private readonly tenantAdminRepo: ITenantAdminRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async execute(
    input: ListTenantUsersUseCaseInput
  ): Promise<ListTenantUsersResult> {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo);
    return this.tenantAdminRepo.listUsers(
      { search: input.search, limit: input.limit, cursor: input.cursor },
      input.tid
    );
  }
}
