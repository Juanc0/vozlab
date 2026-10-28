import { randomBytes } from 'node:crypto';
import { IGlobalInvitationRepository } from '../../domain/ports/IGlobalInvitationRepository.js';
import { hashOpaqueToken } from '../../shared/auth/refreshToken.js';

export interface CreateGlobalInvitationInput {
  tenantId: string;
  workspaceId: string;
  role: string;
  email: string;
  expiresAt: Date;
  maxUses?: number | null;
}

export interface CreateGlobalInvitationResult {
  id: string;
  token: string; // raw, shown once
}

export class CreateGlobalInvitationUseCase {
  constructor(private readonly repo: IGlobalInvitationRepository) {}

  async execute(input: CreateGlobalInvitationInput): Promise<CreateGlobalInvitationResult> {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashOpaqueToken(raw);
    const record = await this.repo.createInvitation({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      role: input.role,
      email: input.email,
      tokenHash,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses ?? null,
    });
    return { id: record.id, token: raw };
  }
}