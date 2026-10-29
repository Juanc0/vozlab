import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';

export interface CleanupExpiredInvitationsInput {
  tid: string;
  /**
   * Remove anonymous event guests with no activity signal for this many
   * days. When omitted, guest cleanup does not run: a destructive sweep
   * must be asked for explicitly (the endpoint or the cron passes a number).
   */
  inactiveGuestDays?: number;
}

export interface CleanupResult {
  expiredInvitations: number;
  removedGuests: number;
}

/**
 * Use Case: the tenant's periodic hygiene sweep (v6/TASK-09, B7).
 *
 * 1. PENDING invitations past their expiry become EXPIRED (a status flip,
 *    never a delete: the row is the record that an invitation existed).
 * 2. Anonymous guests inactive since the cutoff are removed. The delete is
 *    the one operation the append-only rules do not forbid — the guest
 *    account is ephemeral by design (event join), while the membership
 *    events and the opaque `author_hash` authorship it left behind survive.
 */
export class CleanupExpiredInvitationsUseCase {
  constructor(
    private readonly invitationRepo?: IInvitationRepository,
    private readonly userRepo?: IUserRepository
  ) {}

  async execute(input: CleanupExpiredInvitationsInput): Promise<CleanupResult> {
    const now = new Date();

    let expiredInvitations = 0;
    if (this.invitationRepo) {
      expiredInvitations = await this.invitationRepo.expirePending(input.tid, now);
    }

    let removedGuests = 0;
    const days = input.inactiveGuestDays;
    if (this.userRepo && days !== undefined && days >= 1 && days <= 3650) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      removedGuests = await this.userRepo.removeInactiveGuests(input.tid, cutoff);
    }

    return { expiredInvitations, removedGuests };
  }
}
