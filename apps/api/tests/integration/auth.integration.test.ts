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
  DEV_HANDLES,
  DEV_IDENTITIES,
  TENANT_ID,
} from '../../../../packages/database/scripts/dev-identities.js';
import { seedHumanIdentity } from '../../../../packages/database/scripts/seed-identities.js';
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
    const hashes = Array.from(createdCodeHashes);
    // Router directory first (the CLI revoke order), then the tenant
    // credentials — both sides of the ADR-0046 split the suite minted.
    await routerPool.query(
      'delete from credential_routes where credential_hash = any($1::text[])',
      [hashes]
    );
    await tenantPool.query(
      'delete from auth.workspace_join_codes where code_hash = any($1::text[])',
      [hashes]
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
      `insert into auth.workspaces (slug, name, kind)
       values ($1, 'Integration removed ws', 'PRIVATE')
       returning id`,
      [`rmv_it_${randomUUID()}`]
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

  // --- T8 (D-3): seeded identities are login-reachable --------------------

  it('a real F1 login on a SEEDED subject finds the seeded user (audit P5)', async () => {
    // ISSUER TRAP (T8 ruling 6, binding): this process's `OIDC_ISSUER` is
    // the ephemeral mock realm, while the volume's `db:seed:dev` used the
    // issuer its `.env` had. The test therefore does NOT depend on
    // pre-seeded vault rows — it runs the EXPORTED per-person seed routine
    // IN-PROCESS first (issuer from live `process.env`), so CI and local
    // execute identically. Pre-T8 this test fails: without the seeded
    // (issuer, subject) pair the login JITs a duplicate `auth.users` row.
    const issuer = process.env.OIDC_ISSUER as string;
    const persona = DEV_IDENTITIES.maintainer;
    const subject = persona.subject as string;
    const handle = DEV_HANDLES.maintainer as string;

    // Snapshot the pointers this run moves, restored in the `finally` so
    // the dev volume ends exactly as it started (local==CI hygiene). The
    // timestamps are snapshotted as TEXT, not `pg` `Date` objects: JS Dates
    // are millisecond-only, so restoring through them truncates microseconds
    // (`2026-10-31 02:15:07.236793+00` → `…236+00`). The restore SQL casts
    // the text back with `::timestamptz`.
    const prior = await tenantPool.query(
      'select global_user_id from auth.users where id = $1',
      [persona.id]
    );
    const priorGlobalUserId =
      (prior.rows[0]?.global_user_id as string | null) ?? null;
    const priorLink = await routerPool.query(
      `select global_user_id, status, first_seen_at::text as first_seen_at
         from global_user_tenants
        where tenant_id = $1 and tenant_user_id = $2`,
      [tenantId, persona.id]
    );
    const priorLinkVaultId =
      (priorLink.rows[0]?.global_user_id as string | null) ?? null;
    const priorLinkStatus =
      (priorLink.rows[0]?.status as string | null) ?? null;
    const priorLinkFirstSeenAt =
      (priorLink.rows[0]?.first_seen_at as string | null) ?? null;
    // The vault row this run would write under the mock issuer. Present on
    // CI (the provision seed uses the same `OIDC_ISSUER` as this suite) and
    // absent locally (the dev volume's seed ran under its `.env` realm); the
    // `finally` branches on it.
    const priorIssuerVault = await routerPool.query(
      `select id, last_login_at::text as last_login_at, picture
         from global_users where issuer = $1 and subject = $2`,
      [issuer, subject]
    );
    const priorIssuerVaultId =
      (priorIssuerVault.rows[0]?.id as string | null) ?? null;
    const priorIssuerLastLoginAt =
      (priorIssuerVault.rows[0]?.last_login_at as string | null) ?? null;
    const priorIssuerPicture =
      (priorIssuerVault.rows[0]?.picture as string | null) ?? null;
    // The login stamps the external identity's `last_login_at`; capture it
    // (and whether the pair pre-existed at all) so the CI-parity branch can
    // restore it exactly. Locally the pair does not pre-exist.
    const priorExternalIdentity = await tenantPool.query(
      `select last_login_at::text as last_login_at
         from auth.external_identities
        where issuer = $1 and subject = $2`,
      [issuer, subject]
    );
    const priorExternalIdentityExisted = priorExternalIdentity.rowCount === 1;
    const priorExternalIdentityLastLoginAt =
      (priorExternalIdentity.rows[0]?.last_login_at as string | null) ?? null;

    const seedOptions = {
      routerPool,
      tenantPool,
      tenantId: TENANT_ID,
      issuer,
      emailPepper: process.env.EMAIL_PEPPER as string,
    };
    // Seeded INSIDE the `try`: a seed or assertion failure still runs the
    // `finally`. The cleanup resolves the run's vault row from the DB rather
    // than trusting this variable, which stays undefined if the seed throws.
    let seeded: { globalUserId: string } | undefined;
    const tokenStart = new Date();
    try {
      seeded = await seedHumanIdentity(seedOptions, 'maintainer');

      const vaultBefore = await routerPool.query(
        `select id, last_login_at, email_hash, full_name, email_verified
           from global_users where issuer = $1 and subject = $2`,
        [issuer, subject]
      );
      expect(vaultBefore.rowCount).toBe(1);
      expect(vaultBefore.rows[0].id).toBe(seeded.globalUserId);

      const callback = await completeLogin(
        {
          sub: subject,
          email: persona.email,
          emailVerified: true,
          name: persona.fullName,
          tenantKey: 'sabana',
        },
        '/'
      );
      expect(callback.headers.get('location')).toBe(`${WEB_ORIGIN}/`);
      const cookie = refreshCookie(callback);

      // Exactly ONE tenant user for the seeded handle. This query alone
      // cannot detect a JIT duplicate (a colliding duplicate gets a NULL
      // handle); the real duplicate proofs are the external-identity
      // `user_id` assertion below and `session.user.id`. The handle survives
      // because it equals `deriveHandle`'s value for this persona (ruling 4).
      const userRows = await tenantPool.query(
        'select id, global_user_id from auth.users where handle = $1',
        [handle]
      );
      expect(userRows.rowCount).toBe(1);
      expect(userRows.rows[0].id).toBe(persona.id);
      expect(userRows.rows[0].global_user_id).toBe(seeded.globalUserId);

      // The external-identity pair is not duplicated and still points at
      // the seeded user (pre-T8 this row did not exist at all).
      const extRows = await tenantPool.query(
        'select user_id from auth.external_identities where issuer = $1 and subject = $2',
        [issuer, subject]
      );
      expect(extRows.rowCount).toBe(1);
      expect(extRows.rows[0].user_id).toBe(persona.id);

      // The vault row was UPDATED (`last_login_at` stamped by the login),
      // never inserted: same id, still exactly one row.
      const vaultAfter = await routerPool.query(
        'select id, last_login_at from global_users where issuer = $1 and subject = $2',
        [issuer, subject]
      );
      expect(vaultAfter.rowCount).toBe(1);
      expect(vaultAfter.rows[0].id).toBe(seeded.globalUserId);
      expect(vaultAfter.rows[0].last_login_at).not.toBeNull();
      if (vaultBefore.rows[0].last_login_at !== null) {
        expect(
          new Date(vaultAfter.rows[0].last_login_at).getTime()
        ).toBeGreaterThan(
          new Date(vaultBefore.rows[0].last_login_at).getTime()
        );
      }

      // The seeded ACTIVE link survived the login in the sabana tenant.
      const linkRows = await routerPool.query(
        `select status, tenant_user_id from global_user_tenants
          where global_user_id = $1 and tenant_id = $2`,
        [seeded.globalUserId, tenantId]
      );
      expect(linkRows.rowCount).toBe(1);
      expect(linkRows.rows[0]).toMatchObject({
        status: 'ACTIVE',
        tenant_user_id: persona.id,
      });

      // A working session in the sabana tenant: the seeded memberships of
      // the person (not an orphan JIT account) answer `/auth/me`.
      const refresh = await refreshSession(cookie);
      expect(refresh.status).toBe(200);
      const session = (await refresh.json()) as {
        accessToken: string;
        user: { id: string };
      };
      expect(session.user.id).toBe(persona.id);
      const meResponse = await me(session.accessToken);
      expect(meResponse.status).toBe(200);
      const meBody = (await meResponse.json()) as {
        workspaces: Array<{ id: string; role: string }>;
      };
      expect(meBody.workspaces).toContainEqual(
        expect.objectContaining({ id: workspaceId, role: 'ADMIN' })
      );
    } finally {
      // Undo every row the mock-issuer run wrote and restore the moved
      // pointers, so the volume keeps the state its own seed issued. Two
      // shapes exist, and only the local one may delete:
      //   - local: the volume was seeded under a different issuer (this
      //     process forces the mock realm), so every mock-issuer row here
      //     was created BY THIS TEST → delete them.
      //   - CI parity (`.github/workflows/ci.yml` seeds under this same mock
      //     issuer): the vault / external-identity / link rows pre-existed →
      //     deleting them would leave `auth.users.global_user_id` dangling,
      //     so re-seed them and restore the login-stamped fields exactly.
      //
      // Resolve the run's vault from the DB rather than trusting `seeded`:
      // the seed may have thrown before returning while still having written
      // the vault row.
      const currentVault = await routerPool.query(
        'select id from global_users where issuer = $1 and subject = $2',
        [issuer, subject]
      );
      const currentVaultId =
        (currentVault.rows[0]?.id as string | null) ?? null;

      await tenantPool.query(
        'delete from auth.refresh_tokens where user_id = $1 and created_at >= $2',
        [persona.id, tokenStart]
      );
      if (currentVaultId !== null) {
        // Bounded to this run: `tokenStart` precedes the seed and the login,
        // and nothing else writes events for this vault in that window.
        await routerPool.query(
          `delete from global_user_events
            where global_user_id = $1 and created_at >= $2`,
          [currentVaultId, tokenStart]
        );
      }
      if (priorIssuerVaultId !== null) {
        // Idempotent upserts heal what the login moved (email_hash,
        // full_name, last_seen_at, link anchor). The seed deliberately never
        // writes `last_login_at` (a seed is not a login), so restore it and
        // `picture` explicitly — the callback overwrites `picture` with the
        // IdP's value, which the mock does not assert.
        const reseeded = await seedHumanIdentity(seedOptions, 'maintainer');
        await routerPool.query(
          'update global_users set last_login_at = $2::timestamptz, picture = $3 where id = $1',
          [reseeded.globalUserId, priorIssuerLastLoginAt, priorIssuerPicture]
        );
        if (priorExternalIdentityExisted) {
          // Only when the pair pre-existed: locally the row this run created
          // is deleted below, so there is no prior timestamp to restore.
          await tenantPool.query(
            `update auth.external_identities set last_login_at = $3::timestamptz
              where issuer = $1 and subject = $2`,
            [issuer, subject, priorExternalIdentityLastLoginAt]
          );
        }
      } else {
        await tenantPool.query(
          'delete from auth.external_identities where issuer = $1 and subject = $2',
          [issuer, subject]
        );
        if (currentVaultId !== null) {
          await routerPool.query(
            'delete from global_user_tenants where global_user_id = $1',
            [currentVaultId]
          );
          // Move the pointer OFF the row BEFORE deleting it: a crash between
          // these statements must never leave `auth.users.global_user_id`
          // pointing at a deleted vault row. The unconditional restore below
          // repeats this for the no-vault path.
          await tenantPool.query(
            'update auth.users set global_user_id = $2 where id = $1',
            [persona.id, priorGlobalUserId]
          );
          await routerPool.query('delete from global_users where id = $1', [
            currentVaultId,
          ]);
        }
      }
      await tenantPool.query(
        'update auth.users set global_user_id = $2 where id = $1',
        [persona.id, priorGlobalUserId]
      );
      if (priorLinkVaultId !== null) {
        await routerPool.query(
          `insert into global_user_tenants
             (global_user_id, tenant_id, tenant_user_id, status)
           values ($1, $2, $3, 'ACTIVE')
           on conflict (tenant_id, tenant_user_id)
           do update set global_user_id = excluded.global_user_id,
                         status = 'ACTIVE'`,
          [priorLinkVaultId, tenantId, persona.id]
        );
        // Re-inserting the link resets `status`/`first_seen_at` to their
        // column defaults; restore the snapshotted values (`first_seen_at`
        // round-trips as text so its microseconds survive). `last_seen_at`
        // (vault and link) is the only timestamp the seed/login intentionally
        // moves and is not restored.
        await routerPool.query(
          `update global_user_tenants set status = $3, first_seen_at = $4::timestamptz
            where tenant_id = $1 and tenant_user_id = $2`,
          [tenantId, persona.id, priorLinkStatus, priorLinkFirstSeenAt]
        );
      } else {
        await routerPool.query(
          'delete from global_user_tenants where tenant_id = $1 and tenant_user_id = $2',
          [tenantId, persona.id]
        );
      }
    }
  });

  it('redeems a tenant-local invitation when the IdP email differs only in case/whitespace (DEC-4 end-to-end)', async () => {
    // The invitation bound only the peppered hash of the canonical address;
    // the mock IdP asserts the SAME address with different case and padding.
    // The equality of hashes (trim+lower, then HMAC) is all matching ever
    // needs — this is the normalization proof against the migrated dev
    // volume. DEC-9: the token must also be ROUTABLE — the unified callback
    // resolves the tenant from `credential_routes` before anything else.
    const invitedEmail = `it-redeem-${randomUUID()}@example.edu`;
    const minted = await mintInvitationCredential(invitedEmail);

    const identity: MockOidcIdentity = {
      sub: `it-redeem-${randomUUID()}`,
      email: `  ${invitedEmail.toUpperCase()}  `,
      emailVerified: true,
      name: 'Integration Redeem',
      tenantKey: 'sabana',
    };
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/', {
      invitation: minted.raw,
    });
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
      [minted.invitationId]
    );
    expect(inviteRow.rows[0]).toMatchObject({ status: 'ACCEPTED', used_count: 1 });
  });

  // --- Credential routing, invitation side (DEC-9, audit §8.5) -----------

  /**
   * Mint an invitation exactly like `CreateInvitationUseCase` (tenant
   * authority FIRST, then the idempotent router route): a PENDING
   * email-bound row in `auth.invitations` plus its `credential_routes`
   * entry. `status` simulates the admin revoke (tenant row only — the route
   * stays stale and inert, ruling 7).
   */
  async function mintInvitationCredential(
    invitedEmail: string,
    opts: { status?: 'PENDING' | 'REVOKED' } = {}
  ): Promise<{ raw: string; invitationId: string }> {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const inserted = await tenantPool.query(
      `insert into auth.invitations
         (workspace_id, email_hash, role, token_hash, expires_at, max_uses, status)
       values ($1, $2, 'MEMBER', $3, now() + interval '1 hour', 1, $4)
       returning id`,
      [
        workspaceId,
        hashEmail(invitedEmail, process.env.EMAIL_PEPPER as string),
        tokenHash,
        opts.status ?? 'PENDING',
      ]
    );
    createdInvitationIds.add(inserted.rows[0].id as string);
    createdCodeHashes.add(tokenHash); // afterEach: router directory cleanup
    await routerPool.query(
      `insert into credential_routes (credential_hash, kind, tenant_id)
       values ($1, 'INVITATION', $2)`,
      [tokenHash, tenantId]
    );
    return { raw, invitationId: inserted.rows[0].id as string };
  }

  it('an external invitee redeems a Sabana invitation through a personal IdP login in ONE callback (DEC-9, §8.5)', async () => {
    // The C3/C4 persona: a gmail-like identity asserted by a provider that
    // maps to NO institutional tenant. Without the invitation this login
    // ends in ERR_TENANT_NOT_PROVISIONED; with it, the route IS the tenant
    // selector and the callback produces JIT user + router link + ACTIVE
    // membership + working session in one hop.
    const invitedEmail = `it-ext-${randomUUID()}@gmail.com`;
    const minted = await mintInvitationCredential(invitedEmail);

    const identity: MockOidcIdentity = {
      sub: `it-ext-${randomUUID()}`,
      email: invitedEmail,
      emailVerified: true,
      name: 'Integration External Invitee',
      tenantKey: `missing-${RUN_ID}`,
    };
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/', {
      invitation: minted.raw,
    });
    expect(callback.headers.get('location')).toBe(`${WEB_ORIGIN}/`);
    const cookie = refreshCookie(callback);

    // JIT tenant user + ACTIVE membership in the invited workspace.
    const membership = await tenantPool.query(
      `select m.role, m.status
         from auth.workspace_memberships m
         join auth.external_identities e on e.user_id = m.user_id
        where m.workspace_id = $1 and e.subject = $2`,
      [workspaceId, identity.sub]
    );
    expect(membership.rows[0]).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });

    // Router link created: the picker lists Sabana from now on.
    const link = await routerPool.query(
      `select count(*)::int as count
         from global_user_tenants t
         join global_users u on u.id = t.global_user_id
        where u.subject = $1 and t.status = 'ACTIVE'`,
      [identity.sub]
    );
    expect(link.rows[0].count).toBe(1);

    // Single-use consumed; a second session on the same token cannot be
    // re-redeemed because the invitation is now ACCEPTED.
    const inviteRow = await tenantPool.query(
      'select status, used_count from auth.invitations where id = $1',
      [minted.invitationId]
    );
    expect(inviteRow.rows[0]).toMatchObject({ status: 'ACCEPTED', used_count: 1 });

    // The session works: refresh yields an access token for this user.
    const refresh = await refreshSession(cookie);
    expect(refresh.status).toBe(200);
    const body = (await refresh.json()) as { user: { fullName: string } };
    expect(body.user.fullName).toBe('Integration External Invitee');
  });

  it('a revoked invitation is inert: the login proceeds with no membership (ruling 7)', async () => {
    // Admin revoke touches the TENANT row only; the router route goes stale.
    // DEC-9's invariant — routing is never authority — turns the dead link
    // into "continue without redeeming", never a bricked login: the Sabana
    // persona still signs in through the claim, with zero membership.
    const invitedEmail = `it-revoked-${randomUUID()}@example.edu`;
    const minted = await mintInvitationCredential(invitedEmail, {
      status: 'REVOKED',
    });

    const identity: MockOidcIdentity = {
      sub: `it-revoked-${randomUUID()}`,
      email: invitedEmail,
      emailVerified: true,
      name: 'Integration Revoked Link',
      tenantKey: 'sabana',
    };
    createdSubjects.add(identity.sub);

    const callback = await completeLogin(identity, '/', {
      invitation: minted.raw,
    });
    // Login proceeds normally (302 to the app with a session cookie).
    expect(callback.headers.get('location')).toBe(`${WEB_ORIGIN}/`);
    refreshCookie(callback);

    const membership = await tenantPool.query(
      `select count(*)::int as count
         from auth.workspace_memberships m
         join auth.external_identities e on e.user_id = m.user_id
        where m.workspace_id = $1 and e.subject = $2`,
      [workspaceId, identity.sub]
    );
    expect(membership.rows[0].count).toBe(0);

    // The revoked row was never accepted and burned no use.
    const inviteRow = await tenantPool.query(
      'select status, used_count from auth.invitations where id = $1',
      [minted.invitationId]
    );
    expect(inviteRow.rows[0]).toMatchObject({ status: 'REVOKED', used_count: 0 });
  });

  // --- Credential routing, event side (ADR-0046) -------------------------

  /**
   * Mint an EVENT credential exactly like `db:event-code` (tenant FIRST,
   * then the idempotent router route). `route:false` simulates a missing
   * directory entry; `expired` mints a dead-on-arrival row.
   */
  async function mintEventCredential(opts: {
    raw?: string;
    maxUses?: number | null;
    workspaceId?: string;
    route?: boolean;
    expired?: boolean;
    autoApprove?: boolean;
  } = {}): Promise<{ raw: string; codeHash: string; workspaceId: string }> {
    const workspaceId =
      opts.workspaceId ??
      (
        await tenantPool.query(
          `insert into auth.workspaces (slug, name, kind)
           values ($1, 'Integration event', 'EVENT') returning id`,
          [`evt_it_${randomUUID()}`]
        )
      ).rows[0].id as string;
    if (!opts.workspaceId) createdEventWorkspaceIds.add(workspaceId);
    const raw = opts.raw ?? `vle_it_${randomUUID().replace(/-/g, '')}`;
    const codeHash = createHash('sha256').update(raw).digest('hex');
    createdCodeHashes.add(codeHash);
    await tenantPool.query(
      `insert into auth.workspace_join_codes
         (workspace_id, code_hash, purpose, label, expires_at, max_uses, auto_approve)
       values ($1, $2, 'EVENT', 'integration',
               ${opts.expired ? `now() - interval '1 minute'` : `now() + interval '1 hour'`},
               $3, $4)`,
      [workspaceId, codeHash, opts.maxUses ?? null, opts.autoApprove ?? true]
    );
    if (opts.route !== false) {
      await routerPool.query(
        `insert into credential_routes (credential_hash, kind, tenant_id)
         values ($1, 'EVENT', $2)`,
        [codeHash, tenantId]
      );
    }
    return { raw, codeHash, workspaceId };
  }

  async function eventJoin(
    code: string,
    alias?: string
  ): Promise<Response> {
    return fetch(`${API}/api/v1/auth/event-join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alias ? { code, alias } : { code }),
    });
  }

  async function loginSession(): Promise<{ accessToken: string; userId: string }> {
    const identity = uniqueIdentity('jre');
    createdSubjects.add(identity.sub);
    const callback = await completeLogin(identity, '/');
    const refresh = await refreshSession(refreshCookie(callback));
    expect(refresh.status).toBe(200);
    const { accessToken, user } = (await refresh.json()) as {
      accessToken: string;
      user: { id: string };
    };
    createdUserIds.add(user.id);
    return { accessToken, userId: user.id };
  }

  /** Create a PRIVATE workspace with a live WORKSPACE join code. */
  async function mintWorkspaceCredential(autoApprove: boolean): Promise<{
    raw: string;
    codeHash: string;
    workspaceId: string;
  }> {
    const ws = await tenantPool.query(
      `insert into auth.workspaces (slug, name, kind)
       values ($1, 'Integration private ws', 'PRIVATE') returning id`,
      [`prv_it_${randomUUID()}`]
    );
    const workspaceId = ws.rows[0].id as string;
    createdEventWorkspaceIds.add(workspaceId);
    const raw = randomBytes(12).toString('hex'); // 24 chars — schema cap
    const codeHash = createHash('sha256').update(raw).digest('hex');
    createdCodeHashes.add(codeHash);
    await tenantPool.query(
      `insert into auth.workspace_join_codes
         (workspace_id, code_hash, purpose, label, auto_approve)
       values ($1, $2, 'WORKSPACE', 'integration', $3)`,
      [workspaceId, codeHash, autoApprove]
    );
    return { raw, codeHash, workspaceId };
  }

  it('joins through the routed EVENT credential, grants GUEST, and collapses dead states into 404', async () => {
    const { raw, codeHash, workspaceId } = await mintEventCredential({
      maxUses: 1,
    });

    const join = await eventJoin(raw, 'Integration Visitor');
    expect(join.status).toBe(200);
    const session = (await join.json()) as {
      accessToken: string;
      user: { id: string; provider: string; anonymousAlias: string | null };
    };
    createdUserIds.add(session.user.id);
    expect(session.user.provider).toBe('ANONYMOUS_EVENT');
    expect(session.user.anonymousAlias).toBe('Integration Visitor');

    const meResponse = await me(session.accessToken);
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as {
      workspaces: Array<{ id: string; role: string }>;
    };
    // v6 semantics: the anonymous event participant joins as GUEST.
    expect(meBody.workspaces).toContainEqual(
      expect.objectContaining({ id: workspaceId, role: 'GUEST' })
    );

    expect((await refreshSession(refreshCookie(join))).status).toBe(200);

    // The tenant credential records exactly one claimed use.
    const row = await tenantPool.query(
      'select used_count from auth.workspace_join_codes where code_hash = $1',
      [codeHash]
    );
    expect(row.rows[0].used_count).toBe(1);

    // Exhausted, expired, revoked and unknown are ONE answer — the
    // conditional redemption cannot leak which state the code is in.
    const full = await eventJoin(raw, 'Second Visitor');
    expect(full.status).toBe(404);
    expect((await full.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });

    const invalid = await eventJoin(`vle_invalid_${randomUUID().replace(/-/g, '')}`);
    expect(invalid.status).toBe(404);
    expect((await invalid.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });

    const { raw: deadRaw } = await mintEventCredential({ expired: true });
    const expired = await eventJoin(deadRaw);
    expect(expired.status).toBe(404);

    const { raw: noAutoRaw } = await mintEventCredential({ autoApprove: false });
    const noAuto = await eventJoin(noAutoRaw);
    expect(noAuto.status).toBe(404);
  });

  it('a route without a valid tenant credential is a plain 404 (routing is not authority)', async () => {
    // Directory row exists, tenant credential was deleted after minting:
    // the router answers a tenant id, the redemption answers nothing.
    const { raw, codeHash } = await mintEventCredential();
    await tenantPool.query(
      'delete from auth.workspace_join_codes where code_hash = $1',
      [codeHash]
    );

    const join = await eventJoin(raw);
    expect(join.status).toBe(404);
    expect((await join.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });

    // The other direction: credential live, directory missing → 404 before
    // any tenant DB is opened.
    const { raw: orphanRaw } = await mintEventCredential({ route: false });
    const orphan = await eventJoin(orphanRaw);
    expect(orphan.status).toBe(404);
    expect((await orphan.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });
  });

  it('the CLI mints a redeemable EVENT code and --revoke 404s the redemption (audit D-5)', async () => {
    // Full operator path: `db:event-code` against the live dev volume —
    // tenant row first, router route second — then redeem as an attendee,
    // then revoke with the CLI and see the join 404.
    const ws = await tenantPool.query(
      `insert into auth.workspaces (slug, name, kind)
       values ($1, 'CLI event', 'EVENT') returning id`,
      [`cli_it_${randomUUID()}`]
    );
    const eventWorkspaceId = ws.rows[0].id as string;
    createdEventWorkspaceIds.add(eventWorkspaceId);

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const cliEnv = { ...process.env };

    const minted = await run(
      'pnpm',
      [
        '--filter',
        '@vozlab/database',
        'db:event-code',
        '--',
        '--tenant',
        'sabana',
        '--workspace',
        eventWorkspaceId,
        '--label',
        'CLI integration round',
        '--days',
        '1',
        '--max-uses',
        '5',
      ],
      { cwd: process.cwd(), env: cliEnv, timeout: 20_000 }
    );
    const raw = /\n\s{2}(vle_[0-9A-Za-z_-]+)\n/.exec(minted.stdout)?.[1];
    if (!raw) throw new Error(`CLI did not print the raw code:\n${minted.stdout}`);
    const codeHash = createHash('sha256').update(raw).digest('hex');
    createdCodeHashes.add(codeHash);

    const join = await eventJoin(raw, 'CLI Visitor');
    expect(join.status).toBe(200);
    const session = (await join.json()) as {
      user: { id: string; provider: string };
    };
    createdUserIds.add(session.user.id);
    expect(session.user.provider).toBe('ANONYMOUS_EVENT');
    const membership = await tenantPool.query(
      `select role from auth.workspace_memberships where user_id = $1 and workspace_id = $2`,
      [session.user.id, eventWorkspaceId]
    );
    expect(membership.rows[0].role).toBe('GUEST');

    // --revoke: route FIRST, then the tenant row.
    await run(
      'pnpm',
      ['--filter', '@vozlab/database', 'db:event-code', '--', '--revoke', raw],
      { cwd: process.cwd(), env: cliEnv, timeout: 20_000 }
    );
    const routeRow = await routerPool.query(
      'select 1 from credential_routes where credential_hash = $1',
      [codeHash]
    );
    expect(routeRow.rowCount).toBe(0);
    const codeRow = await tenantPool.query(
      'select revoked_at from auth.workspace_join_codes where code_hash = $1',
      [codeHash]
    );
    expect(codeRow.rows[0].revoked_at).not.toBeNull();

    const after = await eventJoin(raw, 'Too Late');
    expect(after.status).toBe(404);
    expect((await after.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });

    // Revoking a code that does not exist exits non-zero (D-5 contract).
    await expect(
      run(
        'pnpm',
        [
          '--filter',
          '@vozlab/database',
          'db:event-code',
          '--',
          '--revoke',
          `vle_never_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        ],
        { cwd: process.cwd(), env: cliEnv, timeout: 20_000 }
      )
    ).rejects.toThrow();
  });

  it('rejects an EVENT code presented to the authenticated join path (cross-purpose, P-3)', async () => {
    // An EVENT credential can never grant an authenticated membership: the
    // redemption statement filters purpose='WORKSPACE' and matches nothing.
    const { accessToken } = await loginSession();
    const { codeHash: evtHash, raw: evtRaw } = await mintEventCredential({
      // Short raw (≤24 chars) so it also clears the join-request DTO.
      raw: `vle_x_${randomBytes(8).toString('hex')}`,
    });
    const asMember = await fetch(`${API}/api/v1/workspace-join-requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code: evtRaw }),
    });
    expect(asMember.status).toBe(404);
    expect((await asMember.json()) as { code: string }).toMatchObject({
      code: 'ERR_WORKSPACE_NOT_FOUND',
    });
    const evtRow = await tenantPool.query(
      'select used_count from auth.workspace_join_codes where code_hash = $1',
      [evtHash]
    );
    expect(evtRow.rows[0].used_count).toBe(0);
  });

  it('rejects a WORKSPACE code presented to the event path even with a planted EVENT route (cross-purpose, P-3)', async () => {
    // A deliberately planted EVENT directory row forces the tenant-side
    // miss: the conditional redemption filters purpose='EVENT' and the
    // WORKSPACE credential is untouched.
    const wsCode = await mintWorkspaceCredential(false);
    await routerPool.query(
      `insert into credential_routes (credential_hash, kind, tenant_id)
       values ($1, 'EVENT', $2)`,
      [wsCode.codeHash, tenantId]
    );
    const asVisitor = await eventJoin(wsCode.raw);
    expect(asVisitor.status).toBe(404);
    expect((await asVisitor.json()) as { code: string }).toMatchObject({
      code: 'ERR_EVENT_CODE_INVALID',
    });
    const wsRow = await tenantPool.query(
      'select used_count from auth.workspace_join_codes where code_hash = $1',
      [wsCode.codeHash]
    );
    expect(wsRow.rows[0].used_count).toBe(0);
  });

  it('two concurrent presentations of a private code burn exactly one use (T4-M1)', async () => {
    // Race: both transactions claim a use; the loser's INSERT conflicts on
    // the partial unique PENDING index, its consume rolls back, and both
    // callers still receive the pending answer.
    const { accessToken } = await loginSession();
    const { raw, codeHash, workspaceId } = await mintWorkspaceCredential(false);

    const present = async () =>
      fetch(`${API}/api/v1/workspace-join-requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code: raw }),
      });

    const [a, b] = await Promise.all([present(), present()]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    const bodies = await Promise.all([a.json(), b.json()]);
    for (const body of bodies) {
      expect(body as { status: string }).toMatchObject({ status: 'PENDING' });
    }

    const counts = await tenantPool.query(
      `select count(*)::int as requests
         from auth.workspace_join_requests
        where workspace_id = $1 and status = 'PENDING'`,
      [workspaceId]
    );
    expect(counts.rows[0].requests).toBe(1);

    // The rolled-back claim left exactly one committed use — the duplicate
    // presentation burned nothing.
    const row = await tenantPool.query(
      'select used_count from auth.workspace_join_codes where code_hash = $1',
      [codeHash]
    );
    expect(row.rows[0].used_count).toBe(1);

    // A third, sequential presentation also keeps the counter at 1.
    const third = await present();
    expect(third.status).toBe(201);
    const again = await tenantPool.query(
      'select used_count from auth.workspace_join_codes where code_hash = $1',
      [codeHash]
    );
    expect(again.rows[0].used_count).toBe(1);
  });
});
