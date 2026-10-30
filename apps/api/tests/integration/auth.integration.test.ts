import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { hashEmail } from '../../src/shared/auth/refreshToken.js';
import {
  startMockOidcProvider,
  type MockOidcIdentity,
  type MockOidcProvider,
} from './support/mockOidc.js';

const API_PORT = Number(process.env.PORT);
const API = `http://127.0.0.1:${API_PORT}`;
const OIDC_PORT = Number(process.env.MOCK_OIDC_PORT);
const OIDC_ORIGIN = `http://127.0.0.1:${OIDC_PORT}`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const RUN_ID = randomUUID();

const routerPool = new Pool({
  host: process.env.ROUTER_DB_HOST,
  port: Number(process.env.ROUTER_DB_PORT),
  user: process.env.ROUTER_DB_USER,
  password: process.env.ROUTER_DB_PASSWORD,
  database: process.env.ROUTER_DB_NAME,
});

const tenantPool = new Pool({
  host: process.env.TENANT_DB_HOST,
  port: Number(process.env.TENANT_DB_PORT),
  user: process.env.TENANT_DB_USER,
  password: process.env.TENANT_DB_PASSWORD,
  database: process.env.TENANT_DB_NAME,
});

let app: FastifyInstance | undefined;
let oidc: MockOidcProvider | undefined;
let tenantId = '';
let workspaceId = '';

const createdSubjects = new Set<string>();
const createdUserIds = new Set<string>();
const createdCodeHashes = new Set<string>();
const createdInvitationIds = new Set<string>();
const createdEventWorkspaceIds = new Set<string>();

function uniqueIdentity(label: string): MockOidcIdentity {
  const suffix = randomUUID();
  return {
    sub: `it-${label}-${suffix}`,
    email: `it-${label}-${suffix}@example.edu`,
    emailVerified: true,
    name: `Integration ${label}`,
    tenantKey: 'sabana',
  };
}

function refreshCookie(response: Response): string {
  const header = response.headers.get('set-cookie');
  const match = header
    ? /(?:^|,\s*)vozlab_refresh=([^;]+)/.exec(header)
    : null;
  if (!match) {
    throw new Error(`missing refresh cookie (set-cookie: ${header ?? 'none'})`);
  }
  return match[1];
}

async function beginLogin(
  redirectPath = '/',
  extraParams: Record<string, string> = {}
): Promise<string> {
  const url = new URL(`${API}/api/v1/auth/login`);
  url.searchParams.set('redirect', redirectPath);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), { redirect: 'manual' });
  expect(response.status).toBe(302);
  const location = response.headers.get('location');
  if (!location) throw new Error('login did not redirect to the IdP');
  return location;
}

async function completeLogin(
  identity: MockOidcIdentity,
  redirectPath = '/',
  extraParams: Record<string, string> = {}
): Promise<Response> {
  if (!oidc) throw new Error('mock OIDC provider not started');
  oidc.setIdentity(identity);

  const authorizationUrl = await beginLogin(redirectPath, extraParams);
  const idpResponse = await fetch(authorizationUrl, { redirect: 'manual' });
  expect(idpResponse.status).toBe(302);
  const callbackUrl = idpResponse.headers.get('location');
  if (!callbackUrl) throw new Error('mock IdP did not redirect to callback');

  return fetch(callbackUrl, { redirect: 'manual' });
}

async function refreshSession(cookie: string): Promise<Response> {
  return fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: `vozlab_refresh=${cookie}` },
  });
}

async function me(accessToken: string): Promise<Response> {
  return fetch(`${API}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

beforeAll(async () => {
  oidc = await startMockOidcProvider({
    port: OIDC_PORT,
    issuerOrigin: OIDC_ORIGIN,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  });

  const { buildServer } = await import(
    '../../src/infrastructure/http/server.js'
  );
  app = await buildServer();
  await app.listen({ port: API_PORT, host: '127.0.0.1' });

  const tenant = await routerPool.query(
    'select id from tenants where oidc_tenant_id = $1',
    ['sabana']
  );
  const workspace = await tenantPool.query(
    'select id from auth.workspaces where slug = $1',
    ['general']
  );
  if (tenant.rowCount !== 1 || workspace.rowCount !== 1) {
    throw new Error(
      'integration prerequisites missing: run db:migrate and db:seed:dev against docker-compose'
    );
  }
  tenantId = tenant.rows[0].id as string;
  workspaceId = workspace.rows[0].id as string;
});

afterEach(async () => {
  if (createdUserIds.size > 0) {
    await tenantPool.query(
      'delete from auth.users where id = any($1::uuid[])',
      [Array.from(createdUserIds)]
    );
  }
  if (createdInvitationIds.size > 0) {
    await tenantPool.query(
      'delete from auth.invitations where id = any($1::uuid[])',
      [Array.from(createdInvitationIds)]
    );
  }
  if (createdCodeHashes.size > 0) {
    await routerPool.query(
      'delete from event_codes where code_hash = any($1::text[])',
      [Array.from(createdCodeHashes)]
    );
  }
  if (createdEventWorkspaceIds.size > 0) {
    const ids = Array.from(createdEventWorkspaceIds);
    await tenantPool.query(
      'delete from auth.workspace_memberships where workspace_id = any($1::uuid[])',
      [ids]
    );
    await tenantPool.query('delete from auth.workspaces where id = any($1::uuid[])', [ids]);
  }
  // Audit P6: the suite's logins leave rows in the router vault
  // (`global_users` + tenant links + `OIDC_LOGIN` events). Delete order:
  // events (no FK) → links → users. Bounded by the `it-` subject prefix and
  // the mock issuer so only this suite's residue is removed — the local==CI
  // invariant means the dev router must be clean after every run.
  const testIssuer = process.env.OIDC_ISSUER as string;
  const residue = `subject like 'it-%' and issuer = $1`;
  await tenantPool.query(
    `delete from auth.users where id in (
       select user_id from auth.external_identities where ${residue})`,
    [testIssuer]
  );
  await routerPool.query(
    `delete from global_user_events where global_user_id in
       (select id from global_users where ${residue})`,
    [testIssuer]
  );
  await routerPool.query(
    `delete from global_user_tenants where global_user_id in
       (select id from global_users where ${residue})`,
    [testIssuer]
  );
  await routerPool.query(`delete from global_users where ${residue}`, [
    testIssuer,
  ]);
  createdSubjects.clear();
  createdUserIds.clear();
  createdInvitationIds.clear();
  createdCodeHashes.clear();
  createdEventWorkspaceIds.clear();
});

afterAll(async () => {
  await app?.close();
  await oidc?.close();
  await routerPool.end();
  await tenantPool.end();
});

describe('auth integration', () => {
  it('logs in through OIDC, stores only a hashed refresh token, and logs out', async () => {
    const identity = uniqueIdentity('login');
    createdSubjects.add(identity.sub);

    // Audit P7.4: the IdP `picture` claim must reach the router vault.
    const callback = await completeLogin(
      { ...identity, picture: `${OIDC_ORIGIN}/avatar/login.png` },
      '/proposals'
    );
    expect(callback.headers.get('location')).toBe(`${WEB_ORIGIN}/proposals`);

    const firstCookie = refreshCookie(callback);
    expect(firstCookie).toMatch(
      /^v1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/
    );

    const users = await tenantPool.query(
      `select u.id, u.provider, u.author_hash
         from auth.users u
         join auth.external_identities e on e.user_id = u.id
        where e.issuer = $1 and e.subject = $2`,
      [process.env.OIDC_ISSUER, identity.sub]
    );
    expect(users.rowCount).toBe(1);
    const user = users.rows[0] as {
      id: string;
      provider: string;
      author_hash: string;
    };
    createdUserIds.add(user.id);
    expect(user.provider).toBe('OIDC_INSTITUTIONAL');
    expect(user.author_hash).toMatch(/^[0-9a-f]{64}$/);

    const memberships = await tenantPool.query(
      'select count(*)::int as count from auth.workspace_memberships where user_id = $1',
      [user.id]
    );
    expect(memberships.rows[0].count).toBe(0);

    const tokenHash = createHash('sha256').update(firstCookie).digest('hex');
    const stored = await tenantPool.query(
      'select token_hash from auth.refresh_tokens where user_id = $1',
      [user.id]
    );
    expect(stored.rows.map((row) => row.token_hash)).toContain(tokenHash);

    const refresh = await refreshSession(firstCookie);
    expect(refresh.status).toBe(200);
    const session = (await refresh.json()) as {
      accessToken: string;
      user: { id: string };
    };
    expect(session.user.id).toBe(user.id);
    const secondCookie = refreshCookie(refresh);
    expect(secondCookie).not.toBe(firstCookie);

    const meResponse = await me(session.accessToken);
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as { workspaces: unknown[] };
    expect(meBody.workspaces).toEqual([]);

    const logout = await fetch(`${API}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        cookie: `vozlab_refresh=${secondCookie}`,
      },
    });
    expect(logout.status).toBe(200);
    const logoutBody = (await logout.json()) as { endSessionUrl: string };
    expect(logoutBody.endSessionUrl).toContain('/end_session');

    const afterLogout = await me(session.accessToken);
    expect(afterLogout.status).toBe(401);
    expect((await afterLogout.json()) as { code: string }).toMatchObject({
      code: 'ERR_TOKEN_BLACKLISTED',
    });

    expect((await refreshSession(secondCookie)).status).toBe(401);

    // Audit P7.4: the vault column now carries the IdP claim.
    const vault = await routerPool.query(
      'select picture from global_users where issuer = $1 and subject = $2',
      [process.env.OIDC_ISSUER, identity.sub]
    );
    expect(vault.rows[0]?.picture).toBe(`${OIDC_ORIGIN}/avatar/login.png`);
  });

  it('lists only ACTIVE memberships on /auth/me (audit P3)', async () => {
    const identity = uniqueIdentity('picker');
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/');
    const refresh = await refreshSession(refreshCookie(callback));
    expect(refresh.status).toBe(200);
    const { accessToken, user } = (await refresh.json()) as {
      accessToken: string;
      user: { id: string };
    };
    createdUserIds.add(user.id);

    // A second workspace carrying ONLY a REMOVED membership: the picker must
    // hide it (and its stale role) exactly like the workspace vanished. The
    // ACTIVE row goes to the seeded 'general' workspace.
    const removedWorkspace = await tenantPool.query(
      `insert into auth.workspaces (slug, name, kind, join_code)
       values ($1, 'Integration removed ws', 'PRIVATE', $2)
       returning id`,
      [`rmv_it_${randomUUID()}`, randomUUID().replace(/-/g, '').slice(0, 24)]
    );
    const removedWorkspaceId = removedWorkspace.rows[0].id as string;
    createdEventWorkspaceIds.add(removedWorkspaceId);

    await tenantPool.query(
      `insert into auth.workspace_memberships (workspace_id, user_id, role, status)
       values ($1, $2, 'MEMBER', 'ACTIVE'), ($3, $2, 'MEMBER', 'REMOVED')`,
      [workspaceId, user.id, removedWorkspaceId]
    );

    const meResponse = await me(accessToken);
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as {
      workspaces: Array<{ id: string; role: string }>;
    };
    expect(meBody.workspaces.map((ws) => ws.id)).toEqual([workspaceId]);
  });

  it('detects refresh-token reuse and revokes the family', async () => {
    const identity = uniqueIdentity('reuse');
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/');
    const firstCookie = refreshCookie(callback);

    const firstRefresh = await refreshSession(firstCookie);
    expect(firstRefresh.status).toBe(200);
    const secondCookie = refreshCookie(firstRefresh);

    const reuse = await refreshSession(firstCookie);
    expect(reuse.status).toBe(401);
    expect((await reuse.json()) as { code: string }).toMatchObject({
      code: 'ERR_REFRESH_TOKEN_INVALID',
    });

    expect((await refreshSession(secondCookie)).status).toBe(401);
  });

  it('rejects an unknown OIDC tenant without creating a user', async () => {
    const identity = uniqueIdentity('unknown');
    createdSubjects.add(identity.sub);

    const callback = await completeLogin({
      ...identity,
      tenantKey: `missing-${RUN_ID}`,
    });

    expect(callback.status).toBe(302);
    const location = new URL(callback.headers.get('location') as string);
    expect(location.origin).toBe(new URL(WEB_ORIGIN).origin);
    expect(location.pathname).toBe('/auth/callback');
    expect(location.searchParams.get('error')).toBe(
      'ERR_TENANT_NOT_PROVISIONED'
    );
    expect(callback.headers.get('set-cookie')).toBeNull();

    const users = await tenantPool.query(
      'select count(*)::int as count from auth.external_identities where subject = $1',
      [identity.sub]
    );
    expect(users.rows[0].count).toBe(0);
  });

  it('rejects an explicitly unverified email', async () => {
    const identity = uniqueIdentity('unverified');
    createdSubjects.add(identity.sub);

    const callback = await completeLogin({
      ...identity,
      emailVerified: false,
    });

    const location = new URL(callback.headers.get('location') as string);
    expect(location.searchParams.get('error')).toBe('ERR_EMAIL_NOT_VERIFIED');
    expect(callback.headers.get('set-cookie')).toBeNull();

    const users = await tenantPool.query(
      'select count(*)::int as count from auth.external_identities where subject = $1',
      [identity.sub]
    );
    expect(users.rows[0].count).toBe(0);
  });

  it('redeems a tenant-local invitation when the IdP email differs only in case/whitespace (DEC-4 end-to-end)', async () => {
    // The invitation bound only the peppered hash of the canonical address;
    // the mock IdP asserts the SAME address with different case and padding.
    // The equality of hashes (trim+lower, then HMAC) must bridge it — this
    // is the normalization proof against the migrated dev volume.
    const invitedEmail = `it-redeem-${randomUUID()}@example.edu`;
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const inserted = await tenantPool.query(
      `insert into auth.invitations
         (workspace_id, email_hash, role, token_hash, expires_at, max_uses, status)
       values ($1, $2, 'MEMBER', $3, now() + interval '1 hour', 1, 'PENDING')
       returning id`,
      [workspaceId, hashEmail(invitedEmail, process.env.EMAIL_PEPPER as string), tokenHash]
    );
    createdInvitationIds.add(inserted.rows[0].id as string);

    const identity: MockOidcIdentity = {
      sub: `it-redeem-${randomUUID()}`,
      email: `  ${invitedEmail.toUpperCase()}  `,
      emailVerified: true,
      name: 'Integration Redeem',
      tenantKey: 'sabana',
    };
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/', { invitation: rawToken });
    expect(callback.headers.get('location')).toBe(`${WEB_ORIGIN}/`);

    const membership = await tenantPool.query(
      `select count(*)::int as count
         from auth.workspace_memberships m
         join auth.external_identities e on e.user_id = m.user_id
        where m.workspace_id = $1 and e.subject = $2 and m.status = 'ACTIVE'`,
      [workspaceId, identity.sub]
    );
    expect(membership.rows[0].count).toBe(1);

    const inviteRow = await tenantPool.query(
      `select status, used_count from auth.invitations where id = $1`,
      [inserted.rows[0].id]
    );
    expect(inviteRow.rows[0]).toMatchObject({ status: 'ACCEPTED', used_count: 1 });
  });

  it('joins with an event code, creates a member, and enforces capacity', async () => {
    const code = `vle_it_${randomUUID().replace(/-/g, '')}`;
    const codeHash = createHash('sha256').update(code).digest('hex');
    createdCodeHashes.add(codeHash);

    // JoinEventUseCase only resolves codes for kind='EVENT' workspaces, and
    // join_code is NOT NULL + unique since the tenant baseline. The seeded
    // 'general' workspace is PRIVATE on a fresh migration fold (the dev
    // volume drifted it long ago), so this test creates its own event
    // workspace instead of reusing it.
    const eventWorkspace = await tenantPool.query(
      `insert into auth.workspaces (slug, name, kind, join_code)
       values ($1, 'Integration event', 'EVENT', $2)
       returning id`,
      [`evt_it_${randomUUID()}`, randomUUID().replace(/-/g, '').slice(0, 24)]
    );
    const eventWorkspaceId = eventWorkspace.rows[0].id as string;
    createdEventWorkspaceIds.add(eventWorkspaceId);

    await routerPool.query(
      `insert into event_codes
         (tenant_id, workspace_id, code_hash, label, expires_at, max_uses)
       values ($1, $2, $3, $4, now() + interval '1 hour', 1)`,
      [tenantId, eventWorkspaceId, codeHash, 'integration']
    );

    const join = await fetch(`${API}/api/v1/auth/event-join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, alias: 'Integration Visitor' }),
    });
    expect(join.status).toBe(200);
    const session = (await join.json()) as {
      accessToken: string;
      user: {
        id: string;
        provider: string;
        anonymousAlias: string | null;
      };
    };
    createdUserIds.add(session.user.id);
    expect(session.user.provider).toBe('ANONYMOUS_EVENT');
    expect(session.user.anonymousAlias).toBe('Integration Visitor');

    const meResponse = await me(session.accessToken);
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as {
      workspaces: Array<{ id: string; role: string }>;
    };
    // v6 semantics: the anonymous event participant joins as GUEST
    // (JoinEventUseCase grants WorkspaceRole 'GUEST'; only institutional
    // users can be MEMBER+).
    expect(meBody.workspaces).toContainEqual(
      expect.objectContaining({ id: eventWorkspaceId, role: 'GUEST' })
    );

    expect((await refreshSession(refreshCookie(join))).status).toBe(200);

    const full = await fetch(`${API}/api/v1/auth/event-join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, alias: 'Second Visitor' }),
    });
    expect(full.status).toBe(400);
    expect((await full.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_FULL',
    });

    const invalid = await fetch(`${API}/api/v1/auth/event-join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: `vle_invalid_${randomUUID().replace(/-/g, '')}`,
      }),
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_EXPIRED',
    });
  });
});
