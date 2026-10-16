import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '@vozlab/shared-types';
import { IRouterDatabase } from '../../../domain/ports/IRouterDatabase.js';

/**
 * TenantWorkspaceGuard: Zero-Trust isolation middleware.
 *
 * Responsibilities:
 *   1. Enforce the presence of the `X-Workspace-ID` header (UUID v4).
 *   2. Resolve the tenant `tid` from the OIDC claim / header.
 *   3. Verify the tenant is provisioned in the global router DB.
 *   4. Attach `tid` and `workspaceId` to the request object for downstream use.
 *
 * This guard runs BEFORE any tenant-scoped persistence code, guaranteeing
 * physical multi-tenant isolation (each tenant has its own database).
 */
export async function tenantWorkspaceGuard(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: { routerDb: IRouterDatabase }
): Promise<void> {
  const workspaceId = req.headers['x-workspace-id'] as string | undefined;

  if (!workspaceId) {
    const err = buildError('ERR_MISSING_WORKSPACE_HEADER');
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
    });
  }

  // Validate UUID format — reject malformed identifiers early.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(workspaceId)) {
    const err = buildError('ERR_INVALID_WORKSPACE_HEADER');
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
    });
  }

  // The tenant id is derived from the OIDC claim `tid` (set by the IdP / AuthGuard).
  const oidcTenantId = req.oidcTenantId;
  if (!oidcTenantId) {
    const err = buildError('ERR_UNAUTHORIZED_WORKSPACE_ACCESS');
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
    });
  }

  // Verify the tenant is provisioned in the global router DB.
  const tenant = await deps.routerDb.findTenantByOidcId(oidcTenantId);
  if (!tenant) {
    const err = buildError('ERR_TENANT_NOT_PROVISIONED');
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
    });
  }

  // Attach resolved identifiers to the request for downstream layers.
  req.tid = tenant.id;
  req.workspaceId = workspaceId;
  req.tenantSlug = tenant.slug;
}