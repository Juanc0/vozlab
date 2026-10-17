/**
 * RateLimitingMiddleware: Implements rate limiting per actor, with a coarse
 * per-workspace ceiling, backed by Redis.
 * 
 * Complies with RNF-08:
 *   - GET routes: 300 requests/minute max per actor
 *   - POST/PUT/DELETE routes: 30 requests/minute max per actor
 *   - A workspace-wide ceiling bounds total traffic
 *     (per-actor max × RATE_LIMIT_WORKSPACE_MULTIPLIER).
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, RedisClientType } from 'redis';
import { env } from '../../../shared/config/env.js';
import { log } from '../../../shared/logger/index.js';
import { buildError } from '@vozlab/shared-types';

/**
 * HTTP methods that mutate state and therefore get the tighter write cap.
 * Hoisted so the method vocabulary is declared once (RNF-08).
 */
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Get max requests based on HTTP method, sourced from env (RNF-08).
 */
function getRateLimitMax(method: string): number {
  if (method === 'GET') return env.RATE_LIMIT_READ_MAX;
  if ((WRITE_METHODS as readonly string[]).includes(method)) return env.RATE_LIMIT_WRITE_MAX;
  return env.RATE_LIMIT_READ_MAX; // Default for other methods
}

export class RateLimitingMiddleware {
  private client: RedisClientType;
  private connected = false;

  constructor() {
    this.client = createClient({
      socket: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
      password: env.REDIS_PASSWORD || undefined,
    });

    this.client.on('error', (err) => {
      log.error({ err }, 'Rate limiter Redis client error');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
    log.info('RateLimitingMiddleware connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  /**
   * Increment the fixed-window counter for `key` and report whether it is now
   * over `limitMax`.
   *
   * Fixed window anchored at the first request of the window: INCR the counter
   * and only set the TTL when the key is created (count === 1). Refreshing the
   * TTL on every request would never let the bucket reset under sustained
   * traffic (de-facto lockout). Trade-off: a client can burst up to 2x the
   * limit across a window boundary; acceptable here and far simpler than a
   * sliding-window or token-bucket (see TASK-07).
   */
  private async hit(key: string, limitMax: number): Promise<boolean> {
    // EXPIRE requires an integer number of seconds.
    const windowSeconds = Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000);

    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }

    return count > limitMax;
  }

  /**
   * Check if the caller has exceeded their rate limit.
   * Returns true if limited, false otherwise.
   *
   * Two buckets are enforced so one member cannot lock out their colleagues:
   *   - `actor` bucket: per-caller cap (`authorHash`, or IP when anonymous).
   *   - `workspace` bucket: coarse ceiling for the whole workspace, so a single
   *     workspace still cannot overwhelm the tenant.
   * A request is limited if either bucket is over its cap. The actor bucket is
   * evaluated first so an abusive caller trips their own limit before the
   * shared workspace ceiling is reached.
   */
  async isRateLimited(
    tenantId: string,
    workspaceId: string,
    method: string,
    actor: string
  ): Promise<boolean> {
    const perActorMax = getRateLimitMax(method);
    const actorKey = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}:${actor}`;
    const workspaceKey = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`;

    try {
      if (!this.connected) {
        log.warn('RateLimitingMiddleware not connected — allowing request');
        return false;
      }

      if (await this.hit(actorKey, perActorMax)) {
        log.warn(
          { tenantId, workspaceId, method, actor, bucket: 'actor', limit: perActorMax },
          'rate limit exceeded'
        );
        return true;
      }

      const workspaceMax = perActorMax * env.RATE_LIMIT_WORKSPACE_MULTIPLIER;
      if (await this.hit(workspaceKey, workspaceMax)) {
        log.warn(
          { tenantId, workspaceId, method, actor, bucket: 'workspace', limit: workspaceMax },
          'rate limit exceeded'
        );
        return true;
      }

      return false;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ err: error, tenantId, workspaceId, method, actor }, 'failed to check rate limit');
      
      // On error, be permissive (fail-open) to avoid blocking legitimate requests
      return false;
    }
  }

  /**
   * Reset the rate limit for a specific actor and the workspace bucket
   * (useful for testing/recovery).
   */
  async resetRateLimit(
    tenantId: string,
    workspaceId: string,
    method: string,
    actor: string
  ): Promise<void> {
    const actorKey = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}:${actor}`;
    const workspaceKey = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`;
    await this.client.del([actorKey, workspaceKey]);
    log.info({ tenantId, workspaceId, method, actor }, 'rate limit reset');
  }
}

/**
 * Build a Fastify preHandler that enforces the per-tenant rate limit.
 *
 * The limiter instance is injected (single shared Redis connection) so we
 * never open a new connection per request. Runs AFTER the tenant/workspace
 * guards so that `req.tid` and `req.workspaceId` are already resolved.
 */
export function rateLimitMiddleware(limiter: RateLimitingMiddleware) {
  return async function rateLimitHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const tenantId = req.tid;
    const workspaceId = req.workspaceId;

    // If the tenant was not resolved (e.g. an unauthenticated route), skip.
    if (!tenantId || !workspaceId) return;

    // Authenticated (and agent) callers key on their pseudonymous author hash;
    // anonymous callers fall back to the remote address.
    const actor = req.user?.authorHash ?? req.ip;

    const limited = await limiter.isRateLimited(
      tenantId,
      workspaceId,
      req.method,
      actor
    );

    if (limited) {
      const err = buildError('ERR_RATE_LIMIT_EXCEEDED');
      return reply.status(err.status).send({
        code: err.code,
        message: err.message,
      });
    }
  };
}