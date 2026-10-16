import { FastifyRequest, FastifyReply } from 'fastify';
import { bindReqId } from '../../../shared/logger/index.js';

/**
 * CorrelationGuard: Fastify plugin that binds the request correlation ID
 * (`reqId`) into the AsyncLocalStorage for the entire request lifecycle.
 */
export async function correlationGuard(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const reqId = req.id as string;

  // Bind first: everything below (and every later log in the request) then
  // carries `reqId` automatically via the shared `log` proxy.
  bindReqId(reqId);

  req.reqId = reqId;

  req.log.info({ method: req.method, url: req.url }, 'incoming request');
}

/**
 * Hook to echo the correlation ID back to the client.
 */
export async function sendCorrelationHeader(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const reqId = req.reqId ?? req.id;
  reply.header('X-Request-ID', reqId);
}

/**
 * Decorator helper to retrieve the current reqId from a request.
 */
export function getReqIdFromRequest(req: FastifyRequest): string {
  return req.reqId ?? req.id;
}