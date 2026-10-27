import {
  SignJWT,
  generateKeyPair,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  OidcProviderClient,
  type OidcProviderConfig,
} from '../../src/infrastructure/identity/OidcProviderClient.js';

const CONFIG: OidcProviderConfig = {
  clientId: 'vozlab-api',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/api/v1/auth/callback',
  authUrl: 'https://idp.test/auth',
  tokenUrl: 'https://idp.test/token',
  userinfoUrl: 'https://idp.test/userinfo',
  issuer: 'https://idp.test',
  jwksUrl: 'https://idp.test/jwks',
  scopes: 'openid profile email',
};

let privateKey: KeyLike;
let publicKey: KeyLike;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  jwks = async () => publicKey;
});

async function signIdToken(
  claims: Record<string, unknown> = {},
  options: { nonce?: string; audience?: string } = {}
): Promise<string> {
  return new SignJWT({
    nonce: options.nonce ?? 'nonce-1',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(CONFIG.issuer)
    .setAudience(options.audience ?? CONFIG.clientId)
    .setSubject('idp-sub-1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

function fetchWith(
  tokenResponse: unknown,
  options: { status?: number; userinfo?: unknown } = {}
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });

    if (url === CONFIG.tokenUrl) {
      return new Response(JSON.stringify(tokenResponse), {
        status: options.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === CONFIG.userinfoUrl) {
      return new Response(JSON.stringify(options.userinfo ?? {}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unexpected URL', { status: 500 });
  }) as typeof fetch;

  return { fetchImpl, calls };
}

function makeClient(fetchImpl: typeof fetch): OidcProviderClient {
  return new OidcProviderClient({ config: CONFIG, jwks, fetchImpl });
}

describe('OidcProviderClient', () => {
  it('builds an authorization-code URL with PKCE S256 and nonce', () => {
    const { fetchImpl } = fetchWith({});
    const url = new URL(
      makeClient(fetchImpl).buildAuthorizationUrl({
        state: 'state-1',
        nonce: 'nonce-1',
        codeChallenge: 'challenge-1',
      })
    );

    expect(`${url.origin}${url.pathname}`).toBe(CONFIG.authUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get('scope')).toBe(CONFIG.scopes);
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('nonce')).toBe('nonce-1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges a code and returns the Entra tid as the tenant key', async () => {
    const token = await signIdToken({
      email: 'ada@example.edu',
      email_verified: true,
      name: 'Ada Lovelace',
      tid: 'entra-tenant-guid',
    });
    const { fetchImpl, calls } = fetchWith({
      id_token: token,
      access_token: 'access-1',
    });

    const identity = await makeClient(fetchImpl).exchangeCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      nonce: 'nonce-1',
    });

    expect(identity).toEqual({
      issuer: CONFIG.issuer,
      subject: 'idp-sub-1',
      providerUserId: 'idp-sub-1',
      email: 'ada@example.edu',
      emailVerified: true,
      fullName: 'Ada Lovelace',
      tenantKey: 'entra-tenant-guid',
      providerKind: 'OIDC_INSTITUTIONAL',
    });

    expect(calls).toHaveLength(1);
    const form = String(calls[0].init?.body);
    expect(form).toContain('grant_type=authorization_code');
    expect(form).toContain('code_verifier=verifier-1');
    expect(form).toContain('client_secret=client-secret');
  });

  it('falls back to the Google hd claim for the tenant key', async () => {
    const token = await signIdToken({
      email: 'ada@example.edu',
      email_verified: true,
      hd: 'example.edu',
    });
    const { fetchImpl } = fetchWith({ id_token: token });

    const identity = await makeClient(fetchImpl).exchangeCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      nonce: 'nonce-1',
    });

    expect(identity.tenantKey).toBe('example.edu');
  });

  it('rejects a nonce mismatch', async () => {
    const token = await signIdToken({ tid: 'tenant-1' });
    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'other-nonce',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('rejects a token for another audience', async () => {
    const token = await signIdToken(
      { tid: 'tenant-1' },
      { audience: 'another-client' }
    );
    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('rejects an explicitly unverified email', async () => {
    const token = await signIdToken({
      tid: 'tenant-1',
      email: 'ada@example.edu',
      email_verified: false,
    });
    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_EMAIL_NOT_VERIFIED' });
  });

  it('rejects a token without a tid or hd claim', async () => {
    const token = await signIdToken({ email: 'ada@example.edu' });
    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('rejects a token signed with an unknown key', async () => {
    const otherPair = await generateKeyPair('RS256');
    const token = await new SignJWT({ nonce: 'nonce-1', tid: 'tenant-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(CONFIG.issuer)
      .setAudience(CONFIG.clientId)
      .setSubject('idp-sub-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(otherPair.privateKey);

    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('rejects a token with a wrong issuer', async () => {
    const token = await new SignJWT({ nonce: 'nonce-1', tid: 'tenant-1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://evil-idp.test')
      .setAudience(CONFIG.clientId)
      .setSubject('idp-sub-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('rejects a token with alg: none', async () => {
    // Build an unsigned token manually (alg: none)
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: CONFIG.issuer,
        aud: CONFIG.clientId,
        sub: 'idp-sub-1',
        nonce: 'nonce-1',
        tid: 'tenant-1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      })
    ).toString('base64url');
    const token = `${header}.${payload}.`;

    const { fetchImpl } = fetchWith({ id_token: token });

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('prefers hd over tid when both are present', async () => {
    const token = await signIdToken({
      tid: 'entra-tenant',
      hd: 'example.edu',
      email: 'ada@example.edu',
      email_verified: true,
    });
    const { fetchImpl } = fetchWith({ id_token: token });

    const identity = await makeClient(fetchImpl).exchangeCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      nonce: 'nonce-1',
    });

    expect(identity.tenantKey).toBe('example.edu');
  });

  it('accepts the Zitadel org ID claim as tenant key', async () => {
    const token = await signIdToken({
      'urn:zitadel:iam:user:resourceowner:id': 'zitadel-org-123',
      email: 'ada@example.edu',
      email_verified: true,
    });
    const { fetchImpl } = fetchWith({ id_token: token });

    const identity = await makeClient(fetchImpl).exchangeCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      nonce: 'nonce-1',
    });

    expect(identity.tenantKey).toBe('zitadel-org-123');
  });

  it('maps a token-endpoint rejection to ERR_OIDC_EXCHANGE_FAILED', async () => {
    const { fetchImpl } = fetchWith(
      { error: 'invalid_grant', error_description: 'code expired' },
      { status: 400 }
    );

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_EXCHANGE_FAILED' });
  });

  it('maps a transport failure to ERR_OIDC_UNAVAILABLE', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    await expect(
      makeClient(fetchImpl).exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-1',
        nonce: 'nonce-1',
      })
    ).rejects.toMatchObject({ code: 'ERR_OIDC_UNAVAILABLE' });
  });

  it('fills missing profile claims from userinfo', async () => {
    const token = await signIdToken({ tid: 'tenant-1' });
    const { fetchImpl } = fetchWith(
      { id_token: token, access_token: 'access-1' },
      {
        userinfo: {
          sub: 'idp-sub-1',
          email: 'ada@example.edu',
          email_verified: true,
          name: 'Ada Lovelace',
        },
      }
    );

    const identity = await makeClient(fetchImpl).exchangeCode({
      code: 'auth-code',
      codeVerifier: 'verifier-1',
      nonce: 'nonce-1',
    });

    expect(identity.email).toBe('ada@example.edu');
    expect(identity.fullName).toBe('Ada Lovelace');
    expect(identity.emailVerified).toBe(true);
  });
});
