import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { TRUST_PROXY } from '../../src/infrastructure/http/proxyTrust.js';

/**
 * B11 / topology T2: the API runs behind Caddy. `req.ip` must follow
 * `X-Forwarded-For` only for trusted peers (loopback and the Docker bridge
 * gateway; see proxyTrust.ts), otherwise the anonymous rate-limit buckets —
 * keyed by `req.ip` — collapse into one shared bucket behind the proxy, and
 * any remote client could spoof its bucket by adding the header.
 *
 * The probe app below is built with the same `trustProxy` value the
 * composition root passes to Fastify (the exported `TRUST_PROXY` constant),
 * so this test pins the semantics of the exact option in use.
 */
async function buildProbe(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: TRUST_PROXY });
  app.get('/whoami', async (req) => ({ ip: req.ip }));
  await app.ready();
  return app;
}

async function probeIp(
  app: FastifyInstance,
  remoteAddress: string,
  xForwardedFor?: string
): Promise<string> {
  const res = await app.inject({
    method: 'GET',
    url: '/whoami',
    remoteAddress,
    headers: xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {},
  });
  return (res.json() as { ip: string }).ip;
}

describe('trustProxy (B11/T2)', () => {
  it('resolves req.ip from X-Forwarded-For when the peer is loopback IPv4', async () => {
    const app = await buildProbe();
    expect(await probeIp(app, '127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
    await app.close();
  });

  it('resolves req.ip from X-Forwarded-For when the peer is loopback IPv6', async () => {
    const app = await buildProbe();
    expect(await probeIp(app, '::1', '203.0.113.7')).toBe('203.0.113.7');
    await app.close();
  });

  it('ignores X-Forwarded-For from a public (non-trusted) peer — no spoofing', async () => {
    const app = await buildProbe();
    expect(await probeIp(app, '198.51.100.9', '203.0.113.7')).toBe('198.51.100.9');
    await app.close();
  });

  it('resolves req.ip from X-Forwarded-For for a private peer (Docker NAT gateway)', async () => {
    // Caddy on the host network reaches the published backend ports via
    // 127.0.0.1, but Docker NAT presents the bridge gateway (172.16/12) as
    // the socket peer inside the container.
    const app = await buildProbe();
    expect(await probeIp(app, '172.18.0.1', '203.0.113.7')).toBe('203.0.113.7');
    await app.close();
  });

  it('keeps the socket address when no proxy header is present (dev/E2E)', async () => {
    const app = await buildProbe();
    expect(await probeIp(app, '127.0.0.1')).toBe('127.0.0.1');
    expect(await probeIp(app, '198.51.100.9')).toBe('198.51.100.9');
    await app.close();
  });

  it('walks the XFF chain right-to-left to the first untrusted hop', async () => {
    // Caddy behind another trusted proxy (e.g. a CDN): XFF =
    // "client, intermediate". proxy-addr takes the rightmost value and only
    // keeps walking left while the hop is in the trusted set, so the client
    // address wins over the trusted intermediate.
    const app = await buildProbe();
    expect(await probeIp(app, '127.0.0.1', '203.0.113.7, 10.0.0.5')).toBe('203.0.113.7');
    // With a single proxy, XFF is just the real client IP.
    expect(await probeIp(app, '127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
    await app.close();
  });
});
