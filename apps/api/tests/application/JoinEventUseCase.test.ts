import { describe, expect, it } from 'vitest';
import { JoinEventUseCase } from '../../src/application/use_cases/JoinEventUseCase.js';
import { hashOpaqueToken } from '../../src/shared/auth/refreshToken.js';
import {
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import { TX_SENTINEL, makeUnitOfWork } from '../support/fakes.js';
import {
  TENANT,
  TENANT_ID,
  TENANT_KEY,
  WORKSPACE_ID,
  makeMembershipRepository,
  makeCredentialRouteRepository,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeTokenIssuer,
  makeUserRepository,
} from '../support/authFakes.js';
import {
  joinCodeRecord,
  makeJoinCodeRepository,
  makeWorkspaceRepository,
  workspaceRecord,
} from '../support/adminFakes.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RAW_CODE = 'vle_event_code_123';
const CODE_HASH = hashOpaqueToken(RAW_CODE);

function setup(
  options: {
    /** Whether the EVENT route resolves (default: it does). */
    routed?: boolean;
    /** Join-code rows present in the tenant (default: one live EVENT row). */
    codes?: ReturnType<typeof joinCodeRecord>[];
    /** Tenant workspace rows (default: the code's workspace, kind EVENT). */
    workspaces?: ReturnType<typeof workspaceRecord>[];
    /** Value `findTenantById` answers (default: the routed tenant). */
    byId?: typeof TENANT | null;
  } = {}
) {
  const routes = makeCredentialRouteRepository(
    options.routed === false
      ? {}
      : { [`${CODE_HASH}:EVENT`]: TENANT_ID }
  );
  const router = makeRouterDb({
    byId: options.byId === undefined ? TENANT : options.byId,
  });
  const joinCodes = makeJoinCodeRepository(
    options.codes ?? [
      joinCodeRecord({
        codeHash: CODE_HASH,
        purpose: 'EVENT',
        autoApprove: true,
        workspaceId: WORKSPACE_ID,
      }),
    ]
  );
  const workspaces = makeWorkspaceRepository(
    options.workspaces ?? [
      workspaceRecord({ id: WORKSPACE_ID, kind: 'EVENT' }),
    ]
  );
  const users = makeUserRepository();
  const membership = makeMembershipRepository();
  const refresh = makeRefreshTokenRepository();
  const tokens = makeTokenIssuer();
  const { uow, ran } = makeUnitOfWork();
  const useCase = new JoinEventUseCase(
    routes.credentialRoutes,
    router.routerDb,
    joinCodes.repo,
    workspaces.repo,
    users.userRepo,
    membership.membershipRepo,
    refresh.refreshRepo,
    tokens.tokenIssuer,
    uow,
    REFRESH_TTL_MS
  );

  return {
    useCase,
    routes,
    router,
    joinCodes,
    workspaces,
    users,
    membership,
    refresh,
    tokens,
    ran,
  };
}

describe('JoinEventUseCase (credential routing, ADR-0046)', () => {
  it('routes by hash, redeems the EVENT credential and creates an anonymous GUEST atomically', async () => {
    const { useCase, routes, joinCodes, users, membership, refresh, tokens, ran } =
      setup();

    const result = await useCase.execute({
      code: RAW_CODE,
      alias: 'Curious Otter',
    });

    // L0 directory first, kind-filtered EVENT.
    expect(routes.lookups).toEqual([
      { hash: CODE_HASH, kind: 'EVENT' },
    ]);
    expect(ran.count).toBe(1);

    // The redemption passes the purpose discriminator and the tx handle.
    expect(joinCodes.consumes).toEqual([
      { codeHash: CODE_HASH, purpose: 'EVENT', ok: true },
    ]);
    const row = [...joinCodes.rows.values()][0]!;
    expect(row.usedCount).toBe(1);

    expect(users.anonymousCreates).toHaveLength(1);
    const [{ input, tid, tx }] = users.anonymousCreates;
    expect(tid).toBe(TENANT_ID);
    expect(tx).toBe(TX_SENTINEL);
    expect(input.alias).toBe('Curious Otter');
    expect(input.authorHash).toMatch(/^[a-f0-9]{64}$/);

    expect(membership.added).toHaveLength(1);
    expect(membership.added[0]).toMatchObject({
      userId: '44444444-4444-4444-8444-444444444444',
      workspaceId: WORKSPACE_ID,
      role: 'GUEST',
      tid: TENANT_ID,
      tx: TX_SENTINEL,
    });

    expect(refresh.creates).toHaveLength(1);
    const [{ input: created, tid: createdTid, tx: createdTx }] = refresh.creates;
    expect(createdTid).toBe(TENANT_ID);
    expect(createdTx).toBe(TX_SENTINEL);
    expect(created.tokenHash).toBe(hashOpaqueToken(result.refreshToken));
    expect(parseRefreshToken(result.refreshToken)).toEqual({
      tenantId: TENANT_ID,
    });

    expect(tokens.issued).toEqual([
      {
        userId: '44444444-4444-4444-8444-444444444444',
        tenantKey: TENANT_KEY,
        authorHash: input.authorHash,
      },
    ]);
    expect(result.accessToken).toBe('access-token-1');
    expect(result.user.anonymousAlias).toBe('Curious Otter');
  });

  it('generates an anonymous alias when the caller does not supply one', async () => {
    const { useCase, users } = setup();

    await useCase.execute({ code: RAW_CODE });

    expect(users.anonymousCreates[0].input.alias).toMatch(/^Anonymous [a-f0-9]{6}$/);
  });

  it('rejects an unknown code with ERR_EVENT_CODE_INVALID before touching a tenant', async () => {
    const { useCase, ran, joinCodes } = setup({ routed: false });

    await expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_CODE_INVALID' });
    // The route never authorizes: no tenant transaction is opened at all.
    expect(ran.count).toBe(0);
    expect(joinCodes.consumes).toEqual([]);
  });

  it('rejects a route whose tenant credential is missing (plain 404)', async () => {
    // Ruling 4: the directory row exists but the tenant has no live EVENT
    // code — the redemption answers null and nothing is created.
    const { useCase, joinCodes, users, ran } = setup({ codes: [] });

    await expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_CODE_INVALID' });
    expect(joinCodes.consumes).toHaveLength(1);
    expect(users.anonymousCreates).toEqual([]);
    expect(ran.count).toBe(1);
  });

  it.each([
    {
      name: 'revoked',
      overrides: { revokedAt: new Date('2026-01-01') },
    },
    {
      name: 'expired',
      overrides: { expiresAt: new Date('2026-01-01') },
    },
    {
      name: 'exhausted',
      overrides: { maxUses: 1, usedCount: 1 },
    },
    {
      name: 'without auto_approve',
      overrides: { autoApprove: false },
    },
  ])('collapses a $name EVENT credential into ERR_EVENT_CODE_INVALID', ({ overrides }) => {
    const { useCase, users } = setup({
      codes: [
        joinCodeRecord({
          codeHash: CODE_HASH,
          purpose: 'EVENT',
          autoApprove: true,
          workspaceId: WORKSPACE_ID,
          ...overrides,
        }),
      ],
    });

    return expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_CODE_INVALID' }).then(() => {
      expect(users.anonymousCreates).toEqual([]);
    });
  });

  it('rejects an EVENT credential pointing at a non-EVENT workspace', async () => {
    // Defense in depth (ruling 3): the tenant row is redeemed, but the
    // workspace kind assertion below the redemption still fires.
    const { useCase, users } = setup({
      workspaces: [workspaceRecord({ id: WORKSPACE_ID, kind: 'PRIVATE' })],
    });

    await expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_CODE_INVALID' });
    expect(users.anonymousCreates).toEqual([]);
  });

  it('rejects a WORKSPACE-purpose code presented to the event path (cross-purpose)', async () => {
    // Ruling 4 guard: the hash routes (the directory has the row) but the
    // tenant credential belongs to the other class — consume must miss.
    const { useCase, users } = setup({
      codes: [
        joinCodeRecord({
          codeHash: CODE_HASH,
          purpose: 'WORKSPACE',
          autoApprove: true,
          workspaceId: WORKSPACE_ID,
        }),
      ],
    });

    await expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_CODE_INVALID' });
    expect(useCase).toBeDefined();
    expect(users.anonymousCreates).toEqual([]);
  });

  it('rejects a code whose tenant disappeared', async () => {
    const { useCase, ran } = setup({ byId: null });

    await expect(
      useCase.execute({ code: RAW_CODE })
    ).rejects.toMatchObject({ code: 'ERR_TENANT_NOT_PROVISIONED' });
    expect(ran.count).toBe(0);
  });
});
