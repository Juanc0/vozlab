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
 *
 * MUST stay synchronous (callback form): an `async` onSend hook resolves
 * the chain in a later microtask, so `reply.sent` is still false when the
 * handler's promise settles. Fastify 4.29's `wrapThenable` then re-sends
 * the already-sent reply (double `onSendEnd` → `ERR_HTTP_HEADERS_SENT`
 * crashes the process). See the auth error responses (`sendError`).
 */
export function sendCorrelationHeader(
  req: FastifyRequest,
  reply: FastifyReply,
  _payload: unknown,
  done: () => void
): void {
  const reqId = req.reqId ?? req.id;
  reply.header('X-Request-ID', reqId);
  done();
}

/**
 * Decorator helper to retrieve the current reqId from a request.
 */
export function getReqIdFromRequest(req: FastifyRequest): string {
  return req.reqId ?? req.id;
}