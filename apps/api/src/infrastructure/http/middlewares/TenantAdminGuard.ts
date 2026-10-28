import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '@vozlab/shared-types';
import { IUserRepository } from '../../../domain/ports/IUserRepository.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';

/**
 * TenantAdminGuard: requires `auth.users.system_role = 'ADMIN'`.
 *
 * Runs after `authGuard` and `tenantGuard`, and deliberately does **not**
 * require `X-Workspace-ID`: tenant-wide administration is not scoped to one
 * workspace. The role is read from the tenant database on every request,
 * never trusted from the JWT, so a demotion takes effect immediately.
 */
export function tenantAdminGuard(deps: { userRepo: IUserRepository }) {
  return async function tenantAdminGuardHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = req.user?.userId;
    const tid = req.tid;
    if (!userId || !tid) {
      const err = buildError('ERR_INVALID_TOKEN');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }

    let user;
    try {
      user = await deps.userRepo.findById(userId, tid);
    } catch (error) {
      const err = buildError(
        error instanceof InfrastructureError
          ? error.code
          : 'ERR_INTERNAL_SERVER_ERROR'
      );
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }

    if (!user) {
      const err = buildError('ERR_INVALID_TOKEN');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
    if (user.systemRole !== 'ADMIN') {
      const err = buildError('ERR_AUTHORIZATION_FAILED');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
  };
}
