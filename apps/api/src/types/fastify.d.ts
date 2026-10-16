/**
 * Fastify request augmentation for the Zero-Trust identity chain.
 *
 * The AuthGuard / TenantWorkspaceGuard middlewares attach resolved identity
 * and tenant context to the request. Declaring them here keeps the whole
 * codebase strongly typed instead of scattering `(req as any)` casts.
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Correlation id, attached by CorrelationGuard (mirrors `req.id`). */
    reqId?: string;
    /** Authenticated identity, attached by AuthGuard. */
    user?: {
      userId: string;
      authorHash: string;
    };
    /** OIDC tenant claim (`tid`) extracted from the verified JWT. */
    oidcTenantId?: string;
    /** JWT id, used for the Redis blacklist check. */
    jti?: string;
    /** Internal tenant UUID resolved from the router DB (physical isolation). */
    tid?: string;
    /** Workspace UUID from the X-Workspace-ID header. */
    workspaceId?: string;
    /** Tenant slug (human-readable), for logging/telemetry. */
    tenantSlug?: string;
    /** True when the caller is a system AI agent (bot identity). */
    isSystemAgent?: boolean;
    /** System agent identifier (e.g. AGENT_EXTRACTOR). */
    agentType?: string;
  }
}
