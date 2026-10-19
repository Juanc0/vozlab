import { z } from 'zod';

/**
 * System AI agent identities — the bots the Python workers authenticate as.
 *
 * A worker obtains an HS256 JWT whose `type` claim is one of these values.
 * `AuthGuard` reads the allowlist from `AgentTypeSchema.options` to mark the
 * request as a system agent (`req.isSystemAgent` / `req.agentType`), which
 * exempts it from *workspace membership* — agents are platform actors, not
 * workspace members (FR-17, US-07).
 *
 * Any `type` value outside this enum is NOT treated as a human: `AuthGuard`
 * rejects the token with `401 ERR_INVALID_TOKEN`.
 *
 * Keep in sync with `docs/modules/modules_02_backend_fastify_guide.md` §3.
 */
export const AgentTypeSchema = z.enum([
  'AGENT_EXTRACTOR',
  'AGENT_RELACIONADOR',
  'AGENT_CONSOLIDADOR',
  // Dedicated embedding utility (ADR-0020); not one of the three AI agents.
  'AGENT_EMBEDDER',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;
