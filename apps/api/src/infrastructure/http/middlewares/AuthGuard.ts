import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../../shared/config/env.js';
import { AgentTypeSchema, buildError, type AgentType } from '@vozlab/shared-types';
import { AuthorHash } from '../../../domain/value_objects/AuthorHash.js';
import { RedisTokenBlacklist } from '../../events/RedisTokenBlacklist.js';

/**
 * System agent identifiers allowed to act on the graph as bots.
 * Derived from the shared `@vozlab/shared-types` vocabulary so the allowlist
 * has a single source of truth (see `agent.schema.ts`).
 */
const AGENT_TYPES: ReadonlySet<string> = new Set(AgentTypeSchema.options);

function isAgentType(value: string): value is AgentType {
  return AGENT_TYPES.has(value);
}

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

    // `sub` identifies the caller and `authorHash` is the opaque pseudonym
    // assigned at account creation (auth flow / dev minting) and stored on
    // `auth.users.author_hash`. The API never derives it from the identity
    // and no salt exists, so a token missing either claim is invalid
    // (RF-07, NFR-07).
    if (!payload.sub || !payload.authorHash || !AuthorHash.isValid(payload.authorHash)) {
      const e = buildError('ERR_INVALID_TOKEN');
      return reply.status(e.status).send({ code: e.code, message: e.message });
    }

    // Attach identity to the request for downstream guards/use cases.
    req.user = {
      userId: payload.sub,
      authorHash: AuthorHash.fromString(payload.authorHash).toString(),
    };
    req.oidcTenantId = payload.tid;
    req.jti = payload.jti;

    // System AI agents are identified by the `type` claim (FR-17, US-07).
    //   - An allow-listed `type` marks the request as a bot; membership is
    //     skipped downstream (TenantWorkspaceGuard).
    //   - Any other `type` is rejected outright with 401 ERR_INVALID_TOKEN: an
    //     unknown bot is never silently downgraded to a human caller.
    // Agents carry the `authorHash` minted for their SYSTEM_AGENT user, so an
    // agent always gets a stable per-agent pseudonym.
    if (payload.type !== undefined) {
      if (!isAgentType(payload.type)) {
        const e = buildError('ERR_INVALID_TOKEN');
        return reply.status(e.status).send({ code: e.code, message: e.message });
      }
      req.isSystemAgent = true;
      req.agentType = payload.type;
    }
  };
}