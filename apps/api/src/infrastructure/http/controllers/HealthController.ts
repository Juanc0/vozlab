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

  async ready(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const checks: { database: 'up' | 'down'; redis: 'up' | 'down' } = {
      database: 'up',
      redis: 'up',
    };

    // Router DB check — cheap `SELECT 1`; ping() throws on failure.
    try {
      await this.routerDb.ping();
    } catch {
      checks.database = 'down';
    }

    // Redis check — PING; ping() throws when the connection is down.
    try {
      await this.tokenBlacklist.ping();
    } catch {
      checks.redis = 'down';
    }

    const healthy = checks.database === 'up' && checks.redis === 'up';
    return reply
      .status(healthy ? 200 : 503)
      .send({ status: healthy ? 'ready' : 'degraded', checks });
  }
}
