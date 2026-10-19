import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '@vozlab/shared-types';
import { IRouterDatabase } from '../../../domain/ports/IRouterDatabase.js';
import { IMembershipRepository } from '../../../domain/ports/IMembershipRepository.js';
import { InfrastructureError } from '../../../domain/errors/InfrastructureError.js';
import { tenantGuard } from './TenantGuard.js';

/**
 * TenantWorkspaceGuard: Zero-Trust isolation middleware.
 *
 * Responsibilities:
 *   1. Enforce the presence of the `X-Workspace-ID` header (UUID v4).
 *   2. Resolve the tenant from the verified `tid` claim (via `tenantGuard`).
 *   3. Verify the authenticated user is a member of the header workspace
 *      (FR-05), in the tenant's physical database.
 *   4. Attach `workspaceId` to the request object for downstream use.
 *
 * This guard runs BEFORE any tenant-scoped persistence code, guaranteeing
 * physical multi-tenant isolation (each tenant has its own database).
 */
export async function tenantWorkspaceGuard(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: { routerDb: IRouterDatabase; membershipRepo: IMembershipRepository }
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

  // Resolve the tenant from the verified JWT `tid` claim.
  const tenantResolved = await tenantGuard(req, reply, {
    routerDb: deps.routerDb,
  });
  if (!tenantResolved) return;

  const tid = req.tid;
  if (!tid) {
    const err = buildError('ERR_INTERNAL_SERVER_ERROR');
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
    });
  }

  // Enforce workspace membership (FR-05) — runs against the tenant DB.
  //
  // System-agent contract (FR-17, US-07): agents are platform actors, not
  // workspace members, so they have no `auth.workspace_memberships` row and
  // this membership check is skipped. The rest of the guard still applies:
  //   - the agent MUST send `X-Workspace-ID` (validated above), and
  //   - its `tid` claim MUST resolve to a provisioned tenant in the router DB.
  // Agents are therefore scoped to a workspace exactly like humans, without
  // ever being granted membership or an implicit role.
  if (!req.isSystemAgent) {
    if (!req.user?.userId) {
      const err = buildError('ERR_INVALID_TOKEN');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }

    let isMember: boolean;
    try {
      isMember = await deps.membershipRepo.isMember(
        req.user.userId,
        workspaceId,
        tid
      );
    } catch (e) {
      const err = buildError(
        e instanceof InfrastructureError ? e.code : 'ERR_INTERNAL_SERVER_ERROR'
      );
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }
    if (!isMember) {
      const err = buildError('ERR_UNAUTHORIZED_WORKSPACE_ACCESS');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }
  }

  // Attach the resolved workspace to the request for downstream layers.
  // (`tid` and `tenantSlug` were attached by tenantGuard.)
  req.workspaceId = workspaceId;
}