/**
 * P1: cleanup of expired PENDING invitations and inactive anonymous guests.
 * Implementations iterate the tenant/router repositories and mark rows EXPIRED/REMOVED.
 */
export interface CleanupExpiredInvitationsInput {
  tid: string;
  inactiveGuestDays?: number;
}

export interface CleanupResult {
  expiredInvitations: number;
  removedGuests: number;
}

export class CleanupExpiredInvitationsUseCase {
  async execute(input: CleanupExpiredInvitationsInput): Promise<CleanupResult> {
    // Stub: concrete repository calls wired in server.ts when repositories are available.
    return { expiredInvitations: 0, removedGuests: 0 };
  }
}