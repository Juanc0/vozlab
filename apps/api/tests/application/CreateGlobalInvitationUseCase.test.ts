import { describe, expect, it } from 'vitest';
import { CreateGlobalInvitationUseCase } from '../../src/application/use_cases/CreateGlobalInvitationUseCase.js';
import { hashOpaqueToken } from '../../src/shared/auth/refreshToken.js';
import { TENANT_ID, WORKSPACE_ID, makeGlobalInvitationRepository } from '../support/authFakes.js';

describe('CreateGlobalInvitationUseCase', () => {
  it('stores only the hash and returns the raw token once', async () => {
    const invites = makeGlobalInvitationRepository();
    const useCase = new CreateGlobalInvitationUseCase(invites.repo);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      role: 'CONTRIBUTOR',
      email: 'ada@example.edu',
      expiresAt,
    });

    // Raw token: 32 random bytes hex.
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(invites.records).toHaveLength(1);
    const record = invites.records[0];
    expect(record.tokenHash).toBe(hashOpaqueToken(result.token));
    expect(record.tokenHash).not.toBe(result.token);
    expect(record).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      role: 'CONTRIBUTOR',
      email: 'ada@example.edu',
      status: 'PENDING',
      maxUses: null,
    });
    expect(record.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('issues a distinct token per invitation', async () => {
    const invites = makeGlobalInvitationRepository();
    const useCase = new CreateGlobalInvitationUseCase(invites.repo);
    const base = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      role: 'MEMBER',
      email: 'a@b.test',
      expiresAt: new Date(),
    };

    const one = await useCase.execute(base);
    const two = await useCase.execute(base);

    expect(one.token).not.toBe(two.token);
    expect(one.id).not.toBe(two.id);
  });
});
