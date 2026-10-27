import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { Logger } from 'pino';
import { env } from '../config/env.js';
import { trace } from '@opentelemetry/api';

/**
 * AsyncLocalStorage context that propagates the current request ID
 * (`reqId`) through every log call without manual threading.
 */
const als = new AsyncLocalStorage<string>();

/**
 * Generate a request ID (UUID v4).
 */
function generateReqId(): string {
  return randomUUID();
}

/**
 * Pino logger configured for structured JSON output.
 */
const logger: Logger = pino({
  level: env.LOG_LEVEL,
  transport: env.LOG_PRETTY
    ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: undefined,
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return { trace_id: ctx.traceId, span_id: ctx.spanId };
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'password',
      'token',
      'secret',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Run a function with a bound `reqId` in the AsyncLocalStorage.
 */
export function withReqId<T>(fn: () => T, id?: string): T {
  const reqId = id ?? generateReqId();
  return als.run(reqId, fn);
}

/**
 * Bind the correlation id to the current async context (whole request).
 *
 * Uses `AsyncLocalStorage.enterWith` rather than `run` because a Fastify
 * `onRequest` hook must return before the handler runs: `run` would scope the
 * store to the (synchronous) callback only, while `enterWith` keeps it bound
 * for the current execution context and every async descendant — i.e. the
 * entire request lifecycle.
 */
export function bindReqId(id: string): void {
  als.enterWith(id);
}

/**
 * Get the current `reqId` from the context, or generate one if absent.
 */
export function getReqId(): string {
  return als.getStore() ?? generateReqId();
}

/**
 * A child logger proxy that automatically injects `reqId` from the
 * AsyncLocalStorage context into every log call.
 */
export const log = new Proxy(logger, {
  get(target, prop: string | symbol) {
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (...args: unknown[]) => {
        const reqId = als.getStore();
        if (
          reqId &&
          args.length > 0 &&
          typeof args[0] === 'object' &&
          args[0] !== null &&
          !Array.isArray(args[0])
        ) {
          args[0] = { ...args[0], reqId };
        } else if (reqId) {
          args.unshift({ reqId });
        }
        return value.apply(target, args);
      };
    }
    return value;
  },
});

export { logger };
export type { Logger };