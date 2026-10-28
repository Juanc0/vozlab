/**
 * Port: global identity registry in the router DB (D6, D8).
 *
 * Maps (issuer, subject) → global_identity_id. Contains no PII.
 */
export interface GlobalUserProfile {
  email?: string | null;
  emailVerified?: boolean;
  fullName?: string | null;
  picture?: string | null;
}

export interface GlobalUser {
  id: string;
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
  picture: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface IGlobalUserRepository {
  /** Find or create a global identity by (issuer, subject), upserting profile. */
  findOrCreate(
    issuer: string,
    subject: string,
    profile?: GlobalUserProfile
  ): Promise<GlobalUser>;

  /** Find a global identity by its ID. */
  findById(id: string): Promise<GlobalUser | null>;

  /** Update profile fields for an existing identity. */
  updateProfile(id: string, profile: GlobalUserProfile): Promise<void>;
}