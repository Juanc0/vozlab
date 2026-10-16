import { FastifyRequest, FastifyReply } from 'fastify';
import { IRouterDatabase } from '../../../domain/ports/IRouterDatabase.js';
import { RedisTokenBlacklist } from '../../events/RedisTokenBlacklist.js';

/**
 * HealthController: liveness and readiness probes.
 *
 * - /health: liveness (process is up, no dependencies checked).
 * - /health/ready: readiness, verifies connectivity to the Router DB and Redis.
 */
export class HealthController {
  constructor(
    private readonly routerDb: IRouterDatabase,
    private readonly tokenBlacklist: RedisTokenBlacklist
  ) {}

  async live(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    return reply.status(200).send({ status: 'alive' });
  }

  async ready(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const checks: Record<string, 'ok' | 'fail'> = {};

    // Router DB check — resolves a sentinel tenant lookup (cheap query path).
    try {
      await this.routerDb.findTenantByOidcId('__healthcheck__');
      checks.routerDb = 'ok';
    } catch {
      checks.routerDb = 'fail';
    }

    // Redis check — blacklist probe (no-op GET).
    try {
      await this.tokenBlacklist.isBlacklisted('__healthcheck__');
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return reply
      .status(healthy ? 200 : 503)
      .send({ status: healthy ? 'ok' : 'degraded', checks });
  }
}
