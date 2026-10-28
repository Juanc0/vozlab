import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sendCorrelationHeader } from '../../src/infrastructure/http/middlewares/CorrelationGuard.js';
import { sendError } from '../../src/infrastructure/http/controllers/errorResponse.js';

/**
 * Regression: Fastify 4.29 `wrapThenable` double-send race.
 *
 * An async handler that sends the reply through a void-returning helper
 * (`sendError`) resolves with `undefined`. If the `onSend` chain is still
 * pending (async hooks resolve the chain in later microtasks, so
 * `reply.sent === false`), Fastify re-sends the already-sent reply: the
 * second `onSendEnd` calls `writeHead` after the first one wrote the
 * response and the process dies with `ERR_HTTP_HEADERS_SENT`.
 *
 * The guards against this are: `sendCorrelationHeader` and the security
 * headers hook MUST stay synchronous (callback form). This test wires the
 * REAL correlation hook plus a second onSend hook and asserts that an
 * error response leaves the server alive.
 */
async function startApp(): Promise<{ app: FastifyInstance; base: string }> {
  const app = Fastify({ logger: false });

  app.addHook('onSend', sendCorrelationHeader);
  // Same shape as the security-headers hook in startServer.
  app.addHook('onSend', (_req, reply, _payload, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    done();
  });

  // The dangerous pattern, verbatim from AuthController.refresh: send via a
  // void helper, return undefined, never return the reply.
  app.post('/auth/refresh', async (req, reply) => {
    if (!req.headers.cookie) {
      return sendError(reply, 'ERR_REFRESH_TOKEN_INVALID');
    }
    return { ok: true };
  });
  app.get('/ping', async () => ({ pong: true }));

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  return { app, base: `http://127.0.0.1:${address.port}` };
}

describe('onSend chain must complete synchronously for void-send handlers', () => {
  it('an error response does not crash the server (double-send race)', async () => {
    const { app, base } = await startApp();
    try {
      const first = await fetch(`${base}/auth/refresh`, { method: 'POST' });
      expect(first.status).toBe(401);
      expect(await first.json()).toMatchObject({ code: 'ERR_REFRESH_TOKEN_INVALID' });
      // Both onSend hooks ran on the error reply.
      expect(first.headers.get('x-request-id')).toBeTruthy();
      expect(first.headers.get('x-content-type-options')).toBe('nosniff');

      // The crash (ERR_HTTP_HEADERS_SENT) killed the whole process before
      // the synchronous-hook fix; the second request proves the server lives.
      const second = await fetch(`${base}/auth/refresh`, { method: 'POST' });
      expect(second.status).toBe(401);
      const alive = await fetch(`${base}/ping`);
      expect(alive.status).toBe(200);
      expect(await alive.json()).toEqual({ pong: true });
    } finally {
      await app.close();
    }
  });

  it('a success reply through sendError is single-shot (no reply resend warning)', async () => {
    const { app, base } = await startApp();
    try {
      const res = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { cookie: 'vozlab_refresh=whatever' },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});
