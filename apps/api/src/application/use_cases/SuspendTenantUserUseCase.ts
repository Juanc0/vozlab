import { DomainError } from '../../domain/errors/DomainError.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';

export interface SuspendTenantUserInput {
  actorUserId: string;
  tid: string;
  userId: string;
  reqId?: string;
}

/**
 * Use Case: suspend a tenant user by stamping `sessionsValidAfter = now()`,
 * which invalidates every session issued before this moment.
 */
export class SuspendTenantUserUseCase {
  private userRepo: IUserRepository | null = null;
  private tenantAdminRepo: { listUsers: (input: { limit: number }, tid: string) => Promise<{ users: Array<{ systemRole: string }> }> } | null = null;
  private refreshRepo: { revokeAllForUser: (userId: string, tid: string) => Promise<void> } | null = null;
  private audit?: IAuditLog;

  constructor(...deps: unknown[]) {
    for (const arg of deps) {
      if (!arg || typeof arg !== 'object') continue;
      const a = arg as Record<string, unknown>;
      if (typeof a.setSessionsValidAfter === 'function' || typeof a.updateSystemRole === 'function') {
        this.userRepo = arg as IUserRepository;
      } else if (typeof a.findById === 'function' && typeof a.listUsers === 'function') {
        this.tenantAdminRepo = arg as typeof this.tenantAdminRepo;
      } else if (typeof a.findById === 'function') {
        this.userRepo = this.userRepo ?? (arg as IUserRepository);
      } else if (typeof a.revokeAllForUser === 'function') {
        this.refreshRepo = arg as typeof this.refreshRepo;
      } else if (typeof a.record === 'function') {
        this.audit = arg as IAuditLog;
      }
    }
    if (!this.userRepo) {
      throw new Error('SuspendTenantUserUseCase requires an IUserRepository');
    }
  }

  async execute(input: SuspendTenantUserInput): Promise<void> {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo!);

    const target = await this.userRepo!.findById(input.userId, input.tid);
    if (!target) throw new DomainError('ERR_USER_NOT_FOUND');
    if (target.provider === 'ANONYMOUS_EVENT') throw new DomainError('ERR_USER_NOT_FOUND');

    if (input.actorUserId === input.userId) {
      throw new DomainError('ERR_CANNOT_MODIFY_SELF');
    }

    await this.userRepo!.setSessionsValidAfter(input.userId, new Date(), input.tid);
    if (this.refreshRepo) {
      await this.refreshRepo.revokeAllForUser(input.userId, input.tid);
    }

    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'USER_SUSPENDED',
      targetType: 'user',
      targetId: input.userId,
      tenantId: input.tid,
      requestId: input.reqId,
    });
  }
}