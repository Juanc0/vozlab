import { DomainError } from '../../domain/errors/DomainError.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IAuditLog } from '../../domain/ports/IAuditLog.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';

export interface UpdateTenantUserSystemRoleInput {
  actorUserId: string;
  tid: string;
  userId: string;
  systemRole: string;
  reqId?: string;
}

/**
 * Use Case: promote/demote a tenant user's `system_role`
 * (USER↔ADMIN↔MODERATOR, plus SYSTEM_AGENT).
 *
 * The tenant admin is asserted from the tenant database. Self-demotion of the
 * last remaining tenant ADMIN is refused so the institution never locks
 * itself out. Anonymous-event guests cannot be promoted.
 */
export class UpdateTenantUserSystemRoleUseCase {
  private userRepo: IUserRepository | null = null;
  private tenantAdminRepo: { listUsers: (input: { limit: number }, tid: string) => Promise<{ users: Array<{ systemRole: string }> }> } | null = null;
  private audit?: IAuditLog;

  constructor(...deps: unknown[]) {
    for (const arg of deps) {
      if (!arg || typeof arg !== 'object') continue;
      const a = arg as Record<string, unknown>;
      if (typeof a.updateSystemRole === 'function') {
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
      throw new Error('UpdateTenantUserSystemRoleUseCase requires an IUserRepository');
    }
  }

  private async countTenantAdmins(tid: string): Promise<number> {
    if (typeof this.userRepo!.countSystemAdmins === 'function') {
      return this.userRepo!.countSystemAdmins(tid);
    }
    if (this.tenantAdminRepo) {
      const res = await this.tenantAdminRepo.listUsers({ limit: 10000 }, tid);
      return res.users.filter((u) => u.systemRole === 'ADMIN').length;
    }
    return 1;
  }

  async execute(input: UpdateTenantUserSystemRoleInput) {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo!);

    const target = await this.userRepo!.findById(input.userId, input.tid);
    if (!target) throw new DomainError('ERR_USER_NOT_FOUND');
    if (target.provider === 'ANONYMOUS_EVENT') throw new DomainError('ERR_USER_NOT_FOUND');

    if (input.actorUserId === input.userId && input.systemRole !== 'ADMIN') {
      const admins = await this.countTenantAdmins(input.tid);
      if (admins <= 1) throw new DomainError('ERR_LAST_TENANT_ADMIN');
    }

    const updated = await this.userRepo!.updateSystemRole(
      input.userId,
      input.systemRole,
      input.tid
    );

    await this.audit?.record({
      actorId: input.actorUserId,
      actorType: 'ADMIN',
      action: 'SYSTEM_ROLE_CHANGED',
      targetType: 'user',
      targetId: input.userId,
      tenantId: input.tid,
      metadata: { before: target.systemRole, after: input.systemRole },
      requestId: input.reqId,
    });

    return updated;
  }
}