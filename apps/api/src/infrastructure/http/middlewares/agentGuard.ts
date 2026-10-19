import { FastifyRequest, FastifyReply } from 'fastify';
import { buildError, type AgentType } from '@vozlab/shared-types';

/**
 * AgentGuard: transport-level restriction for agent-only routes.
 *
 * ADR-0020 reserves `PUT /api/v1/nodes/:id/embedding` for the embedding
 * worker. The route must reject human callers and every other agent type —
 * an unknown or mismatched bot is refused, never silently downgraded to a
 * human actor (same rule as `AuthGuard` for the `type` claim).
 *
 * The check runs after `authGuard`, which is what sets `req.isSystemAgent`
 * and `req.agentType`.
 */
export function requireAgentType(agentType: AgentType) {
  return async function requireAgentTypeHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!req.isSystemAgent || req.agentType !== agentType) {
      const err = buildError('ERR_AUTHORIZATION_FAILED');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }
  };
}

/**
 * Accept every allow-listed system agent, whatever its type.
 *
 * Used by routes that are tenant plumbing rather than a specific agent's
 * feature — the source resolution route (ADR-0025), which any ingestion
 * capable worker may need. Humans are still refused.
 */
export function requireSystemAgent() {
  return async function requireSystemAgentHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!req.isSystemAgent) {
      const err = buildError('ERR_AUTHORIZATION_FAILED');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }
  };
}
