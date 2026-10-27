import { createClient, RedisClientType } from 'redis';
import { IEventPublisher } from '../../domain/ports/IEventPublisher.js';
import { env } from '../../shared/config/env.js';
import { log } from '../../shared/logger/index.js';

/**
 * RedisEventPublisher: Redis Streams adapter for the asynchronous pipeline.
 *
 * Logical events are mapped to stream keys by convention:
 *   'NODE_CREATED'      -> stream:node_created
 *   'PROPOSAL_APPROVED' -> stream:proposal_approved
 *
 * Downstream workers (Relacionador, Consolidador) consume these streams with
 * consumer groups. Publication happens AFTER the DB transaction commits, so a
 * broker hiccup never rolls back persisted data; failures are logged only.
 */
export class RedisEventPublisher implements IEventPublisher {
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
      log.error({ err }, 'Redis event publisher client error');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
    log.info('RedisEventPublisher connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  /**
   * Append an event to its stream. Never throws: the write has already been
   * committed, so publication is best-effort with error logging.
   */
  async publish(event: string, payload: Record<string, unknown>): Promise<void> {
    const streamKey = streamKeyFor(event);

    if (!this.connected) {
      log.warn({ event, streamKey }, 'event publisher not connected; event dropped');
      return;
    }

    try {
      await this.client.xAdd(streamKey, '*', toStreamFields(payload));
      log.debug({ event, streamKey }, 'event published to Redis Streams');
    } catch (err) {
      log.error({ err, event, streamKey }, 'failed to publish event to Redis Streams');
    }
  }
}

/**
 * Map a logical event name to its Redis Stream key.
 */
function streamKeyFor(event: string): string {
  return `stream:${event.toLowerCase()}`;
}

/**
 * Redis Streams require flat string field/value pairs, so nested values are
 * JSON-encoded and nullish values become empty strings.
 */
function toStreamFields(payload: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      fields[key] = '';
    } else if (typeof value === 'string') {
      fields[key] = value;
    } else {
      fields[key] = JSON.stringify(value);
    }
  }
  return fields;
}
