import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.js';
import { buildError } from '@vozlab/shared-types';
import { resolveAuthorHash } from '../../../application/services/resolveAuthorHash.js';
import { RedisTokenBlacklist } from '../../events/RedisTokenBlacklist.js';

/**
 * System agent identifiers allowed to act on the graph as bots.
 * Kept in sync with docs/system/system_02_use_cases_and_actors.md.
 */
const AGENT_TYPES: ReadonlySet<string> = new Set([
  'AGENT_EXTRACTOR',
  'AGENT_RELACIONADOR',
  'AGENT_CONSOLIDADOR',
]);

/**
 * Decoded JWT payload shape expected by VozLab.
 * The `tid` claim is the OIDC tenant identifier (set by the IdP).
 */
interface VozLabJwtPayload {
  sub: string;
  tid: string;
  jti: string;
  workspaceId?: string;
  authorHash?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

/**
 * AuthGuard: Fastify preHandler that enforces authenticated requests.
 *
 * Responsibilities:
 *   1. Extract the Bearer token from the Authorization header.
 *   2. Verify the JWT signature and expiry using JWT_SECRET.
 *   3. Check the token `jti` against the Redis blacklist (O(1)).
 *   4. Attach the decoded identity (`user`, `oidcTenantId`) to the request.
 */
export function authGuard(blacklist: RedisTokenBlacklist) {
  return async function authGuardHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = buildError('ERR_INVALID_TOKEN');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }

    const token = authHeader.slice(7).trim();

    let payload: VozLabJwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as VozLabJwtPayload;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        const e = buildError('ERR_TOKEN_EXPIRED');
        return reply.status(e.status).send({ code: e.code, message: e.message });
      }
      const e = buildError('ERR_INVALID_TOKEN');
      return reply.status(e.status).send({ code: e.code, message: e.message });
    }

    // Blacklist check — O(1) Redis GET.
    if (payload.jti && (await blacklist.isBlacklisted(payload.jti))) {
      const e = buildError('ERR_TOKEN_BLACKLISTED');
      return reply.status(e.status).send({ code: e.code, message: e.message });
    }

    // A subject is mandatory: without it identity cannot be resolved
    // deterministically, so we refuse the token instead of collapsing every
    // caller onto a shared placeholder (NFR-07).
    if (!payload.sub) {
      const e = buildError('ERR_INVALID_TOKEN');
      return reply.status(e.status).send({ code: e.code, message: e.message });
    }

    // Attach identity to the request for downstream guards/use cases.
    // The author hash is derived from the configured institutional salt when
    // the token does not already carry one (RF-07, NFR-07).
    req.user = {
      userId: payload.sub,
      authorHash: resolveAuthorHash(payload.authorHash, payload.sub).toString(),
    };
    req.oidcTenantId = payload.tid;
    req.jti = payload.jti;

    // System AI agents are identified by the `type` claim.
    if (payload.type) {
      req.isSystemAgent = AGENT_TYPES.has(payload.type);
      if (req.isSystemAgent) req.agentType = payload.type;
    }
  };
}