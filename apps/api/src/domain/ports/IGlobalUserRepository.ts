/**
 * Port: the global-user registry in the router DB (D6, D8).
 *
 * Maps (issuer, subject) → global_user_id and holds the IdP profile. Since
 * DEC-4 the email is stored ONLY as a peppered hash
 * (`HMAC-SHA-256(lower(trim(email)), EMAIL_PEPPER)`, computed by the caller
 * — the domain never reads the pepper). The profile is PII and lives only in
 * the router DB — tenant DBs reference `global_user_id`, never the profile.
 */
export interface GlobalUserProfile {
  /** Peppered hash of the verified email (DEC-4). Never the cleartext. */
  emailHash?: string | null;
  emailVerified?: boolean;
  fullName?: string | null;
  picture?: string | null;
}

export interface GlobalUser {
  id: string;
  issuer: string;
  subject: string;
  /** Peppered hash of the verified email (DEC-4); `null` when never asserted. */
  emailHash: string | null;
  emailVerified: boolean;
  fullName: string | null;
  picture: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface IGlobalUserRepository {
  /** Find or create a global user by (issuer, subject), upserting profile. */
  findOrCreate(
    issuer: string,
    subject: string,
    profile?: GlobalUserProfile
  ): Promise<GlobalUser>;

  /** Find a global user by its ID. */
  findById(id: string): Promise<GlobalUser | null>;

  /** Update profile fields for an existing identity. */
  updateProfile(id: string, profile: GlobalUserProfile): Promise<void>;
}