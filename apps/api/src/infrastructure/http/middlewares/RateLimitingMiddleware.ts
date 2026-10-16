/**
 * RateLimitingMiddleware: Implements rate limiting per tenant/workspace using Redis.
 * 
 * Complies with RNF-08:
 *   - GET routes: 300 requests/minute max per tenant
 *   - POST/PUT/DELETE routes: 30 requests/minute max per tenant
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, RedisClientType } from 'redis';
import { env } from '../../../shared/config/env.js';
import { log } from '../../../shared/logger/index.js';
import { buildError } from '@vozlab/shared-types';

/**
 * Get max requests based on HTTP method, sourced from env (RNF-08).
 */
function getRateLimitMax(method: string): number {
  if (method === 'GET') return env.RATE_LIMIT_READ_MAX;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return env.RATE_LIMIT_WRITE_MAX;
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
   * Check if the client has exceeded their rate limit.
   * Returns true if limited, false otherwise.
   */
  async isRateLimited(
    tenantId: string,
    workspaceId: string,
    method: string
  ): Promise<boolean> {
    // Create a unique key for the rate limit bucket
    const limitMax = getRateLimitMax(method);
    const windowSeconds = env.RATE_LIMIT_WINDOW_MS / 1000;

    const key = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`;

    try {
      if (!this.connected) {
        log.warn('RateLimitingMiddleware not connected — allowing request');
        return false;
      }

      // Use Redis INCRBYFLOAT with EXPIRE for atomic rate limiting.
      // node-redis returns the float as a string, so coerce explicitly.
      const count = Number(await this.client.incrByFloat(key, 1));

      if (count > limitMax) {
        // Rate limit exceeded - set shorter TTL to quickly release the bucket
        await this.client.expire(key, Math.floor(windowSeconds / 2));
        log.warn({ tenantId, workspaceId, method, count, limit: limitMax }, 'rate limit exceeded');
        return true;
      }

      // Set or refresh the window expiration
      await this.client.expire(key, windowSeconds);

      return false;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ err: error, tenantId, workspaceId, method }, 'failed to check rate limit');
      
      // On error, be permissive (fail-open) to avoid blocking legitimate requests
      return false;
    }
  }

  /**
   * Reset the rate limit for a specific bucket (useful for testing/recovery).
   */
  async resetRateLimit(
    tenantId: string,
    workspaceId: string,
    method: string
  ): Promise<void> {
    const key = `vozlab:ratelimit:${tenantId}:${workspaceId}:${method}`;
    await this.client.del(key);
    log.info({ tenantId, workspaceId, method }, 'rate limit reset');
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

    const limited = await limiter.isRateLimited(
      tenantId,
      workspaceId,
      req.method
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