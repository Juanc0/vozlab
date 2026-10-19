import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JwtTokenIssuer } from '../../src/infrastructure/identity/JwtTokenIssuer.js';

const SECRET = 's'.repeat(32);
const USER_ID = '33333333-3333-4333-8333-333333333333';
const AUTHOR_HASH = 'a'.repeat(64);

describe('JwtTokenIssuer', () => {
  it('signs exactly the claims AuthGuard requires', () => {
    const issuer = new JwtTokenIssuer({ secret: SECRET, expiresIn: '15m' });

    const { token, expiresAt } = issuer.issue({
      userId: USER_ID,
      tenantKey: 'tenant-1',
      authorHash: AUTHOR_HASH,
    });

    const payload = jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    expect(payload.sub).toBe(USER_ID);
    expect(payload.tid).toBe('tenant-1');
    expect(payload.authorHash).toBe(AUTHOR_HASH);
    expect(payload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(payload.type).toBeUndefined();
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
    expect(expiresAt.getTime()).toBe(payload.exp! * 1000);
  });

  it('includes the agent type when minting for a system agent', () => {
    const issuer = new JwtTokenIssuer({ secret: SECRET, expiresIn: '1h' });

    const { token } = issuer.issue({
      userId: USER_ID,
      tenantKey: 'tenant-1',
      authorHash: AUTHOR_HASH,
      agentType: 'AGENT_EXTRACTOR',
    });

    const payload = jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(payload.type).toBe('AGENT_EXTRACTOR');
  });
});
