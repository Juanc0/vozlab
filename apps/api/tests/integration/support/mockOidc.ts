import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface MockOidcIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  /** Entra-style tenant claim; defaults to the seeded dev tenant. */
  tenantKey: string;
  /** Optional Google Workspace hosted-domain claim. */
  hostedDomain?: string;
}

export interface MockOidcOptions {
  port?: number;
  /** Origin used in `iss`, endpoint URLs and the ID token. */
  issuerOrigin?: string;
  clientId?: string;
  clientSecret?: string;
  identity?: Partial<MockOidcIdentity>;
}

export interface MockOidcProvider {
  issuer: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  jwksUrl: string;
  port: number;
  identity: MockOidcIdentity;
  setIdentity(identity: Partial<MockOidcIdentity>): void;
  close(): Promise<void>;
}

interface PendingCode {
  identity: MockOidcIdentity;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}

const ISSUER_PATH = '/realms/vozlab';
const AUTH_PATH = `${ISSUER_PATH}/protocol/openid-connect/auth`;
const TOKEN_PATH = `${ISSUER_PATH}/protocol/openid-connect/token`;
const USERINFO_PATH = `${ISSUER_PATH}/protocol/openid-connect/userinfo`;
const JWKS_PATH = `${ISSUER_PATH}/protocol/openid-connect/certs`;

function defaultIdentity(): MockOidcIdentity {
  const suffix = randomUUID();
  return {
    sub: `mock-sub-${suffix}`,
    email: `mock-${suffix}@example.edu`,
    emailVerified: true,
    name: 'Mock OIDC User',
    tenantKey: 'sabana',
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

/**
 * Minimal OIDC authorization-code + PKCE provider for integration tests.
 *
 * It signs RS256 ID tokens with an ephemeral key, serves the matching JWKS and
 * enforces the same state/nonce/PKCE plumbing the real API expects. No network
 * access leaves the machine.
 */
export async function startMockOidcProvider(
  options: MockOidcOptions = {}
): Promise<MockOidcProvider> {
  const port = options.port ?? 0;
  let issuerOrigin = options.issuerOrigin ?? '';
  let issuer = '';
  const clientId = options.clientId ?? 'vozlab-api';
  const clientSecret = options.clientSecret ?? 'change-me';
  const identity = { ...defaultIdentity(), ...options.identity };
  const pending = new Map<string, PendingCode>();

  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: 'mock-oidc-key',
    alg: 'RS256',
    use: 'sig',
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      sendJson(res, 500, {
        error: 'mock_oidc_error',
        error_description: error instanceof Error ? error.message : 'unknown',
      });
    });
  });

  async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? '/', issuerOrigin);

    if (req.method === 'GET' && url.pathname === AUTH_PATH) {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      const nonce = url.searchParams.get('nonce');
      const challenge = url.searchParams.get('code_challenge');
      const method = url.searchParams.get('code_challenge_method');
      const requestedClientId = url.searchParams.get('client_id');

      if (
        !redirectUri ||
        !state ||
        !nonce ||
        !challenge ||
        method !== 'S256' ||
        requestedClientId !== clientId
      ) {
        sendJson(res, 400, { error: 'invalid_authorization_request' });
        return;
      }

      const code = randomBytes(24).toString('base64url');
      pending.set(code, {
        identity: { ...identity },
        nonce,
        codeChallenge: challenge,
        redirectUri,
        clientId,
      });

      const callback = new URL(redirectUri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', state);
      redirect(res, callback.toString());
      return;
    }

    if (req.method === 'POST' && url.pathname === TOKEN_PATH) {
      const form = new URLSearchParams(await readBody(req));
      const code = form.get('code');
      const stored = code ? pending.get(code) : undefined;
      pending.delete(code ?? '');

      if (
        !stored ||
        form.get('grant_type') !== 'authorization_code' ||
        form.get('client_id') !== clientId ||
        form.get('client_secret') !== clientSecret ||
        form.get('redirect_uri') !== stored.redirectUri
      ) {
        sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }

      const verifier = form.get('code_verifier');
      const challenge = verifier
        ? createHash('sha256').update(verifier).digest('base64url')
        : '';
      if (!verifier || challenge !== stored.codeChallenge) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE' });
        return;
      }

      const claims: Record<string, unknown> = {
        email: stored.identity.email,
        email_verified: stored.identity.emailVerified,
        name: stored.identity.name,
        nonce: stored.nonce,
        tid: stored.identity.tenantKey,
      };
      if (stored.identity.hostedDomain) {
        claims.hd = stored.identity.hostedDomain;
      }

      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'mock-oidc-key' })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setSubject(stored.identity.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      sendJson(res, 200, {
        access_token: `mock-access-${stored.identity.sub}`,
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === USERINFO_PATH) {
      sendJson(res, 200, {
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.emailVerified,
        name: identity.name,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === JWKS_PATH) {
      sendJson(res, 200, { keys: [publicJwk] });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  if (!issuerOrigin) {
    issuerOrigin = `http://localhost:${address.port}`;
  }
  issuer = `${issuerOrigin}${ISSUER_PATH}`;

  return {
    issuer,
    authUrl: `${issuerOrigin}${AUTH_PATH}`,
    tokenUrl: `${issuerOrigin}${TOKEN_PATH}`,
    userinfoUrl: `${issuerOrigin}${USERINFO_PATH}`,
    jwksUrl: `${issuerOrigin}${JWKS_PATH}`,
    port: address.port,
    get identity() {
      return identity;
    },
    setIdentity(next) {
      Object.assign(identity, next);
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
