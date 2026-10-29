import { describe, expect, it } from 'vitest';
import { CleanupExpiredInvitationsUseCase } from '../../src/application/use_cases/CleanupExpiredInvitationsUseCase.js';
import { TENANT_ID, makeUserRepository } from '../support/authFakes.js';

function makeInvitationRepo(expired: number) {
  const calls: Array<{ tid: string; now: Date }> = [];
  return {
    calls,
    repo: {
      async expirePending(tid: string, now: Date) {
        calls.push({ tid, now });
        return expired;
      },
    },
  };
}

describe('CleanupExpiredInvitationsUseCase (v6/TASK-09, B7)', () => {
  it('flips pending invitations past their expiry', async () => {
    const invitations = makeInvitationRepo(3);
    const { userRepo } = makeUserRepository();
    const useCase = new CleanupExpiredInvitationsUseCase(
      invitations.repo as never,
      userRepo
    );

    const before = Date.now();
    const result = await useCase.execute({ tid: TENANT_ID });

    expect(result.expiredInvitations).toBe(3);
    expect(invitations.calls).toHaveLength(1);
    expect(invitations.calls[0].now.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('does NOT sweep guests unless the request asks for it (destructive by opt-in)', async () => {
    const invitations = makeInvitationRepo(1);
    const { userRepo, guestSweeps } = makeUserRepository({ removedGuests: 5 });
    const useCase = new CleanupExpiredInvitationsUseCase(
      invitations.repo as never,
      userRepo
    );

    const result = await useCase.execute({ tid: TENANT_ID });

    expect(result.removedGuests).toBe(0);
    expect(guestSweeps).toHaveLength(0);
  });

  it('sweeps guests older than the requested window and reports both counts', async () => {
    const invitations = makeInvitationRepo(2);
    const { userRepo, guestSweeps } = makeUserRepository({ removedGuests: 5 });
    const useCase = new CleanupExpiredInvitationsUseCase(
      invitations.repo as never,
      userRepo
    );

    const before = Date.now();
    const result = await useCase.execute({
      tid: TENANT_ID,
      inactiveGuestDays: 30,
    });

    expect(result).toEqual({ expiredInvitations: 2, removedGuests: 5 });
    expect(guestSweeps).toHaveLength(1);
    expect(guestSweeps[0].tid).toBe(TENANT_ID);
    const expectedCutoff = before - 30 * 24 * 60 * 60 * 1000;
    // Within the millisecond drift of `now` between the test and the call.
    expect(Math.abs(guestSweeps[0].cutoff.getTime() - expectedCutoff)).toBeLessThan(2000);
  });

  it('ignores an out-of-range window instead of wiping recent guests', async () => {
    const { userRepo, guestSweeps } = makeUserRepository({ removedGuests: 9 });
    const invitations = makeInvitationRepo(0);
    const useCase = new CleanupExpiredInvitationsUseCase(
      invitations.repo as never,
      userRepo
    );

    for (const days of [0, -1, 3651]) {
      const result = await useCase.execute({ tid: TENANT_ID, inactiveGuestDays: days });
      expect(result.removedGuests).toBe(0);
    }
    expect(guestSweeps).toHaveLength(0);
  });

  it('answers zeros when neither repository was wired', async () => {
    const useCase = new CleanupExpiredInvitationsUseCase();
    await expect(
      useCase.execute({ tid: TENANT_ID, inactiveGuestDays: 7 })
    ).resolves.toEqual({ expiredInvitations: 0, removedGuests: 0 });
  });
});
