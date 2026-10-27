import { describe, expect, it } from 'vitest';
import { JoinEventUseCase } from '../../src/application/use_cases/JoinEventUseCase.js';
import type { ConsumeEventCodeResult } from '../../src/domain/ports/IEventCodeRepository.js';
import {
  hashOpaqueToken,
  parseRefreshToken,
} from '../../src/shared/auth/refreshToken.js';
import { TX_SENTINEL, makeUnitOfWork } from '../support/fakes.js';
import {
  TENANT,
  TENANT_ID,
  TENANT_KEY,
  WORKSPACE_ID,
  makeEventCodeRepository,
  makeMembershipRepository,
  makeRefreshTokenRepository,
  makeRouterDb,
  makeTokenIssuer,
  makeUserRepository,
} from '../support/authFakes.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OK: ConsumeEventCodeResult = {
  status: 'OK',
  code: {
    codeId: 'code-1',
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    label: 'Orientation',
  },
};

function setup(
  result: ConsumeEventCodeResult = OK,
  options: { byId?: typeof TENANT | null } = {}
) {
  const event = makeEventCodeRepository(result);
  const router = makeRouterDb({
    byId: options.byId === undefined ? TENANT : options.byId,
  });
  const users = makeUserRepository();
  const membership = makeMembershipRepository();
  const refresh = makeRefreshTokenRepository();
  const tokens = makeTokenIssuer();
  const { uow, ran } = makeUnitOfWork();
  const useCase = new JoinEventUseCase(
    event.eventCodeRepo,
    router.routerDb,
    users.userRepo,
    membership.membershipRepo,
    refresh.refreshRepo,
    tokens.tokenIssuer,
    uow,
    REFRESH_TTL_MS
  );

  return { useCase, event, router, users, membership, refresh, tokens, ran };
}

describe('JoinEventUseCase', () => {
  it('consumes the global code and creates an anonymous member atomically', async () => {
    const { useCase, event, users, membership, refresh, tokens, ran } = setup();

    const result = await useCase.execute({
      code: 'vle_event_code_123',
      alias: 'Curious Otter',
    });

    expect(event.consumedHashes).toEqual([
      hashOpaqueToken('vle_event_code_123'),
    ]);
    expect(ran.count).toBe(1);

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
      role: 'MEMBER',
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
        tenantKey: TENANT_ID,
        authorHash: input.authorHash,
      },
    ]);
    expect(result.accessToken).toBe('access-token-1');
    expect(result.user.anonymousAlias).toBe('Curious Otter');
  });

  it('generates an anonymous alias when the caller does not supply one', async () => {
    const { useCase, users } = setup();

    await useCase.execute({ code: 'vle_event_code_123' });

    expect(users.anonymousCreates[0].input.alias).toMatch(/^Anonymous [a-f0-9]{6}$/);
  });

  it.each<ConsumeEventCodeResult>([
    { status: 'NOT_FOUND' },
    { status: 'EXPIRED' },
    { status: 'REVOKED' },
  ])('rejects a $status code with ERR_EVENT_EXPIRED', async (result) => {
    const { useCase, ran, refresh } = setup(result);

    await expect(
      useCase.execute({ code: 'vle_event_code_123' })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_EXPIRED' });
    expect(ran.count).toBe(0);
    expect(refresh.creates).toEqual([]);
  });

  it('rejects a full event with ERR_EVENT_FULL', async () => {
    const { useCase, ran } = setup({ status: 'FULL' });

    await expect(
      useCase.execute({ code: 'vle_event_code_123' })
    ).rejects.toMatchObject({ code: 'ERR_EVENT_FULL' });
    expect(ran.count).toBe(0);
  });

  it('rejects a code whose tenant disappeared', async () => {
    const { useCase, ran } = setup(OK, { byId: null });

    await expect(
      useCase.execute({ code: 'vle_event_code_123' })
    ).rejects.toMatchObject({ code: 'ERR_TENANT_NOT_PROVISIONED' });
    expect(ran.count).toBe(0);
  });
});
