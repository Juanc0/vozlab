import { DomainError } from '../../domain/errors/DomainError.js';
import {
  AuthUser,
  IUserRepository,
  UserWorkspace,
} from '../../domain/ports/IUserRepository.js';

export interface GetMeInput {
  userId: string;
  tid: string;
}

export interface GetMeResult {
  user: AuthUser;
  workspaces: UserWorkspace[];
}

/**
 * Resolve the caller's profile and memberships. The PWA uses this to populate
 * the workspace picker; it needs no `X-Workspace-ID` because it is not scoped
 * to one workspace.
 */
export class GetMeUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(input: GetMeInput): Promise<GetMeResult> {
    const user = await this.userRepo.findById(input.userId, input.tid);
    if (!user) {
      throw new DomainError('ERR_INVALID_TOKEN');
    }

    const workspaces = await this.userRepo.listWorkspaces(
      input.userId,
      input.tid
    );

    return { user, workspaces };
  }
}
