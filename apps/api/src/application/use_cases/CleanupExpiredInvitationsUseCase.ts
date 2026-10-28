import { IInvitationRepository } from '../../domain/ports/IInvitationRepository.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';

export interface CleanupExpiredInvitationsInput {
  tid: string;
  inactiveGuestDays?: number;
}

export interface CleanupResult {
  expiredInvitations: number;
  removedGuests: number;
}

export class CleanupExpiredInvitationsUseCase {
  constructor(
    private readonly invitationRepo?: IInvitationRepository,
    private readonly userRepo?: IUserRepository,
    private readonly uow?: IUnitOfWork
  ) {}

  async execute(input: CleanupExpiredInvitationsInput): Promise<CleanupResult> {
    let expiredInvitations = 0;
    if (this.invitationRepo) {
      expiredInvitations = await this.invitationRepo.expirePending(
        input.tid,
        new Date()
      );
    }
    // Guest cleanup is a DB-level operation; placeholder for now.
    const removedGuests = 0;
    return { expiredInvitations, removedGuests };
  }
}