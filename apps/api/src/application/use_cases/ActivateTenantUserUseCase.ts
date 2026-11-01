import { DomainError } from '../../domain/errors/DomainError.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';

export interface ActivateTenantUserInput {
  actorUserId: string;
  tid: string;
  userId: string;
  reqId?: string;
}

/**
 * Use Case: clear `sessionsValidAfter` so a suspended tenant user can sign in
 * again.
 */
export class ActivateTenantUserUseCase {
  private userRepo: IUserRepository | null = null;
  private tenantAdminRepo: { listUsers: (input: { limit: number }, tid: string) => Promise<{ users: Array<{ systemRole: string }> }> } | null = null;
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
      } else if (typeof a.record === 'function') {
        this.audit = arg as IAuditLog;
      }
    }
    if (!this.userRepo) {
      throw new Error('ActivateTenantUserUseCase requires an IUserRepository');
    }
  }

  async execute(input: ActivateTenantUserInput): Promise<void> {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo!);

    const target = await this.userRepo!.findById(input.userId, input.tid);
    if (!target) throw new DomainError('ERR_USER_NOT_FOUND');
    if (target.provider === 'ANONYMOUS_EVENT') throw new DomainError('ERR_USER_NOT_FOUND');

    await this.userRepo!.setSessionsValidAfter(input.userId, null, input.tid);

    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'USER_ACTIVATED',
      targetType: 'user',
      targetId: input.userId,
      tenantId: input.tid,
      requestId: input.reqId,
    });
  }
}