/**
 * Port: Event publisher — decouples domain from the message broker.
 * Concrete implementation: RedisEventPublisher (HITO-1.5).
 */
export interface IEventPublisher {
  publish(event: string, payload: Record<string, unknown>): Promise<void>;
}