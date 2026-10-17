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
