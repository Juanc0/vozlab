import { FastifyRequest } from 'fastify';

/**
 * Zero-Trust request context resolved by the guards.
 */
export interface RequestContext {
  workspaceId: string;
  tid: string;
  authorHash: string;
  reqId?: string;
}

/**
 * Extract the identity/tenant context attached by AuthGuard +
 * TenantWorkspaceGuard. Returns null when the guards did not run.
 */
export function getRequestContext(req: FastifyRequest): RequestContext | null {
  const workspaceId = req.workspaceId;
  const tid = req.tid;
  if (!workspaceId || !tid) return null;
  return {
    workspaceId,
    tid,
    authorHash: req.user?.authorHash ?? 'anonymous',
    reqId: req.reqId,
  };
}
