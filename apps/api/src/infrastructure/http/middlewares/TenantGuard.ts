import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '@vozlab/shared-types';
import { IRouterDatabase } from '../../../domain/ports/IRouterDatabase.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';

/**
 * TenantGuard: resolve the caller's tenant from the verified JWT `tid` claim.
 *
 * This is the part of the old `tenantWorkspaceGuard` that has nothing to do
 * with workspaces. It is shared by:
 *   - `tenantWorkspaceGuard`, for every tenant-scoped route; and
 *   - `GET /api/v1/auth/me`, which needs the tenant DB but no workspace header.
 *
 * On success it attaches `req.tid` (internal tenant UUID) and `req.tenantSlug`.
 * Returns `false` after sending the error response.
 */
export async function tenantGuard(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: { routerDb: IRouterDatabase }
): Promise<boolean> {
  const oidcTenantId = req.oidcTenantId;
  if (!oidcTenantId) {
    const err = buildError('ERR_UNAUTHORIZED_WORKSPACE_ACCESS');
    reply.status(err.status).send({ code: err.code, message: err.message });
    return false;
  }

  let tenant: { id: string; slug: string } | null;
  try {
    tenant = await deps.routerDb.findTenantById(oidcTenantId);
  } catch (error) {
    const err = buildError(
      error instanceof InfrastructureError
        ? error.code
        : 'ERR_INTERNAL_SERVER_ERROR'
    );
    reply.status(err.status).send({ code: err.code, message: err.message });
    return false;
  }

  if (!tenant) {
    const err = buildError('ERR_TENANT_NOT_PROVISIONED');
    reply.status(err.status).send({ code: err.code, message: err.message });
    return false;
  }

  req.tid = tenant.id;
  req.tenantSlug = tenant.slug;
  return true;
}
