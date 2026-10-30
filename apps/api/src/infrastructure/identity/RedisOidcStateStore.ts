import { createClient, RedisClientType } from 'redis';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';
import { InfrastructureError } from '../../domain/errors/InfrastructureError.js';
import {
  IOidcStateStore,
  OidcStateData,
} from '../../domain/ports/IOidcStateStore.js';

const KEY_PREFIX = 'vozlab:oidc:state:';

/**
 * Redis-backed, single-use OIDC state.
 *
 * `GETDEL` makes redemption atomic: two concurrent callbacks with the same
 * `state` cannot both succeed. State is short-lived (controller sets 10 min)
 * and includes the PKCE verifier + nonce, which never travel in the URL.
 */
export class RedisOidcStateStore implements IOidcStateStore {
  private client: RedisClientType;
  private connected = false;

  constructor() {
    this.client = createClient({
      socket: { host: env.REDIS_HOST, port: env.REDIS_PORT },
      password: env.REDIS_PASSWORD || undefined,
    });
    this.client.on('error', (err) => {
      log.error({ err }, 'Redis OIDC state client error');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
    log.info('RedisOidcStateStore connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  async save(
    state: string,
    data: OidcStateData,
    ttlSeconds: number
  ): Promise<void> {
    if (!this.connected) {
      throw new InfrastructureError('ERR_REDIS_CONNECTION_FAILED');
    }
    try {
      await this.client.set(`${KEY_PREFIX}${state}`, JSON.stringify(data), {
        EX: ttlSeconds,
      });
    } catch (err) {
      log.error({ err }, 'failed to persist OIDC state');
      throw new InfrastructureError('ERR_REDIS_CONNECTION_FAILED');
    }
  }

  async consume(state: string): Promise<OidcStateData | null> {
    if (!this.connected) {
      throw new InfrastructureError('ERR_REDIS_CONNECTION_FAILED');
    }

    let raw: string | null;
    try {
      raw = await this.client.getDel(`${KEY_PREFIX}${state}`);
    } catch (err) {
      log.error({ err }, 'failed to read OIDC state');
      throw new InfrastructureError('ERR_REDIS_CONNECTION_FAILED');
    }

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<OidcStateData>;
      if (
        typeof parsed.nonce !== 'string' ||
        typeof parsed.codeVerifier !== 'string' ||
        typeof parsed.redirectPath !== 'string'
      ) {
        return null;
      }
      return {
        nonce: parsed.nonce,
        codeVerifier: parsed.codeVerifier,
        redirectPath: parsed.redirectPath,
        // The invitation token rides the state to the callback (D9); the
        // reconstruction must not drop it or redemption silently dies.
        invitationToken:
          typeof parsed.invitationToken === 'string'
            ? parsed.invitationToken
            : undefined,
      };
    } catch {
      return null;
    }
  }
}
