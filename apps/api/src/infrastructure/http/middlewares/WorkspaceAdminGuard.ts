import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '@vozlab/shared-types';
import { IMembershipRepository } from '../../../domain/ports/IMembershipRepository.js';
import { IUserRepository } from '../../../domain/ports/IUserRepository.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';
import { isValidWorkspaceId } from './workspaceId.js';

/**
 * WorkspaceAdminGuard: scopes an administration route to one workspace.
 *
 * There is no tenant-admin bypass: a tenant ADMIN is authorized for a
 * workspace only through an ACTIVE workspace ADMIN membership, exactly like
 * any other user. The guard replaces `tenantWorkspaceGuard` on the
 * administration routes because of the path/header rule:
 *
 *   - a **workspace ADMIN** manages only the workspace named by
 *     `X-Workspace-ID`, and a `:workspaceId` path that disagrees with the
 *     header is answered **404** — the existence of the other workspace is
 *     not leaked.
 *
 * The header stays mandatory on workspace-scoped routes. The role is read from
 * the tenant database on every request, never trusted from the JWT.
 */
export function workspaceAdminGuard(deps: {
  userRepo: IUserRepository;
  membershipRepo: IMembershipRepository;
}) {
  return async function workspaceAdminGuardHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const headerWorkspaceId = req.headers['x-workspace-id'] as string | undefined;
    if (!headerWorkspaceId) {
      const err = buildError('ERR_MISSING_WORKSPACE_HEADER');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
    if (!isValidWorkspaceId(headerWorkspaceId)) {
      const err = buildError('ERR_INVALID_WORKSPACE_HEADER');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }

    const userId = req.user?.userId;
    const tid = req.tid;
    if (!userId || !tid) {
      const err = buildError('ERR_INVALID_TOKEN');
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }

    // Downstream controllers read the header from the request context.
    req.workspaceId = headerWorkspaceId;

    try {
      if (!(await deps.userRepo.findById(userId, tid))) {
        const err = buildError('ERR_INVALID_TOKEN');
        return reply.status(err.status).send({ code: err.code, message: err.message });
      }

      const params = (req.params ?? {}) as { workspaceId?: string };
      const pathWorkspaceId = params.workspaceId;

      if (pathWorkspaceId && pathWorkspaceId !== headerWorkspaceId) {
        const err = buildError('ERR_WORKSPACE_NOT_FOUND');
        return reply.status(err.status).send({ code: err.code, message: err.message });
      }

      // v5: a user may hold several roles in one workspace simultaneously;
      // authorization uses the union of all ACTIVE rows, so a MEMBER+ADMIN
      // passes even when the first row returned is MEMBER. `getRoles` is
      // required by IMembershipRepository, so there is no fallback.
      const roles = await deps.membershipRepo.getRoles(userId, headerWorkspaceId, tid);
      if (roles.length === 0) {
        const err = buildError('ERR_UNAUTHORIZED_WORKSPACE_ACCESS');
        return reply.status(err.status).send({ code: err.code, message: err.message });
      }
      if (!roles.includes('ADMIN')) {
        const err = buildError('ERR_AUTHORIZATION_FAILED');
        return reply.status(err.status).send({ code: err.code, message: err.message });
      }
    } catch (error) {
      const err = buildError(
        error instanceof InfrastructureError
          ? error.code
          : 'ERR_INTERNAL_SERVER_ERROR'
      );
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
  };
}
