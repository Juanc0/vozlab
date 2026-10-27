/**
 * Port: invitations in the tenant DB (D3, D9).
 */
export interface Invitation {
  id: string;
  workspaceId: string;
  email: string | null;
  emailHash: string | null;
  role: string;
  tokenHash: string;
  expiresAt: Date;
  maxUses: number | null;
  usedCount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface IInvitationRepository {
  /** Find an invitation by its token hash. */
  findByTokenHash(tokenHash: string, tid: string): Promise<Invitation | null>;

  /** Mark an invitation as accepted and increment used_count. */
  accept(id: string, tid: string): Promise<void>;

  /** Revoke an invitation. */
  revoke(id: string, tid: string): Promise<void>;

  /** Create a new invitation. */
  create(
    input: {
      workspaceId: string;
      email?: string | null;
      emailHash?: string | null;
      role: string;
      tokenHash: string;
      expiresAt: Date;
      maxUses?: number | null;
      createdBy?: string | null;
    },
    tid: string
  ): Promise<Invitation>;
}