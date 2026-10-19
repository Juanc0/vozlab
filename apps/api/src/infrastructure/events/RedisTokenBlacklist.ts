import { createClient, RedisClientType } from 'redis';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { ITokenBlacklist } from '../../domain/ports/ITokenBlacklist.js';

/**
 * RedisTokenBlacklist: O(1) revocation check for JWT access tokens.
 *
 * Tokens are stored in Redis with a TTL equal to the remaining lifetime
 * of the JWT. This guarantees the blacklist is self-cleaning and the
 * check is a single Redis GET — O(1) latency.
 */
export class RedisTokenBlacklist implements ITokenBlacklist {
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
      log.error({ err }, 'Redis blacklist client error');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
    log.info('RedisTokenBlacklist connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  /**
   * Ping Redis. MUST throw when the connection is down.
   */
  async ping(): Promise<void> {
    if (!this.connected) {
      throw new Error('RedisTokenBlacklist is not connected');
    }
    await this.client.ping();
  }

  /**
   * Check whether a token has been revoked.
   * Returns true if the token is blacklisted.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    if (!this.connected) {
      log.warn('RedisTokenBlacklist not connected — treating token as valid');
      return false;
    }
    const key = `vozlab:blacklist:${jti}`;
    const result = await this.client.get(key);
    return result !== null;
  }

  /**
   * Revoke a token (logout / forced revocation).
   * TTL is set to the remaining token lifetime in seconds.
   */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (!this.connected) {
      log.warn('RedisTokenBlacklist not connected — cannot revoke token');
      return;
    }
    if (ttlSeconds <= 0) return;
    const key = `vozlab:blacklist:${jti}`;
    await this.client.set(key, '1', { EX: ttlSeconds });
    log.info({ jti, ttlSeconds }, 'token revoked');
  }
}