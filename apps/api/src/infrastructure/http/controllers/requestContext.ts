import { FastifyRequest } from 'fastify';

/**
 * Zero-Trust request context resolved by the guards.
 */
export interface RequestContext {
  workspaceId: string;
  tid: string;
  userId: string;
  authorHash: string;
  reqId?: string;
}

/**
 * Extract the identity/tenant context attached by AuthGuard +
 * TenantWorkspaceGuard. Returns null when the guards did not run.
 *
 * `userId` and `authorHash` are mandatory: the guards guarantee their
 * presence on every protected route, so there is no shared-placeholder
 * fallback (which would break pseudonymity and vote uniqueness).
 */
export function getRequestContext(req: FastifyRequest): RequestContext | null {
  const workspaceId = req.workspaceId;
  const tid = req.tid;
  const userId = req.user?.userId;
  const authorHash = req.user?.authorHash;
  if (!workspaceId || !tid || !userId || !authorHash) return null;
  return {
    workspaceId,
    tid,
    userId,
    authorHash,
    reqId: req.reqId,
  };
}

/** Tenant-wide context: no `X-Workspace-ID` is required. */
export interface TenantRequestContext {
  tid: string;
  userId: string;
  authorHash: string;
  reqId?: string;
}

/**
 * Extract the context of a tenant-wide route (administration, workspace
 * discovery). Those routes deliberately do not require a workspace header:
 * a user who belongs to no workspace still has to be able to ask to enter
 * one.
 */
export function getTenantContext(req: FastifyRequest): TenantRequestContext | null {
  const tid = req.tid;
  const userId = req.user?.userId;
  const authorHash = req.user?.authorHash;
  if (!tid || !userId || !authorHash) return null;
  return { tid, userId, authorHash, reqId: req.reqId };
}

/**
 * The workspace an administration handler must act on.
 *
 * The path wins over the header: a tenant ADMIN may open a workspace that is
 * not the one their PWA has selected. A workspace ADMIN is guaranteed by the
 * guard that both are the same.
 */
export function targetWorkspaceId(
  req: FastifyRequest,
  fallback: string
): string {
  const params = (req.params ?? {}) as { workspaceId?: string };
  return params.workspaceId ?? fallback;
}
