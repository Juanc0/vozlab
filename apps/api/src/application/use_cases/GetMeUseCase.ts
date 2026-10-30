import { DomainError } from '../../domain/errors/DomainError.js';
import {
  AuthUser,
  IUserRepository,
  UserWorkspace,
} from '../../domain/ports/IUserRepository.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';

export interface GetMeInput {
  userId: string;
  tid: string;
}

export interface GetMeResult {
  user: AuthUser;
  workspaces: UserWorkspace[];
  /**
   * Router-DB global user linked to this tenant user (v6/TASK-01).
   * `null` when no link exists (legacy rows predating the login-time link).
   * The PWA needs it to render the tenant switcher (`switch-tenant`).
   */
  globalUserId: string | null;
}

/**
 * Resolve the caller's profile and memberships. The PWA uses this to populate
 * the workspace picker; it needs no `X-Workspace-ID` because it is not scoped
 * to one workspace.
 */
export class GetMeUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    /** Optional: without it `globalUserId` is always `null`. */
    private readonly routerDb?: IRouterDatabase
  ) {}

  async execute(input: GetMeInput): Promise<GetMeResult> {
    const user = await this.userRepo.findById(input.userId, input.tid);
    if (!user) {
      throw new DomainError('ERR_INVALID_TOKEN');
    }

    const workspaces = await this.userRepo.listWorkspaces(
      input.userId,
      input.tid
    );

    const globalUserId = this.routerDb
      ? await this.routerDb.findGlobalUserIdForTenantUser(input.tid, user.id)
      : null;

    return { user, workspaces, globalUserId };
  }
}
