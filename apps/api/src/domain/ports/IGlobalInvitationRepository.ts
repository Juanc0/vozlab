export interface GlobalInvitationRecord {
  id: string;
  tokenHash: string;
  tenantId: string;
  workspaceId: string;
  role: string;
  email: string;
  status: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateGlobalInvitationInput {
  tenantId: string;
  workspaceId: string;
  role: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  maxUses?: number | null;
}

export interface IGlobalInvitationRepository {
  createInvitation(input: CreateGlobalInvitationInput): Promise<GlobalInvitationRecord>;
  findByTokenHash(tokenHash: string): Promise<GlobalInvitationRecord | null>;
  accept(id: string): Promise<boolean>;
}