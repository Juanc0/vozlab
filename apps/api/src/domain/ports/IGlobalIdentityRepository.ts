/**
 * Port: global identity registry in the router DB (D6, D8).
 *
 * Maps (issuer, subject) → global_identity_id. Contains no PII.
 */
export interface GlobalIdentity {
  id: string;
  issuer: string;
  subject: string;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface IGlobalIdentityRepository {
  /** Find or create a global identity by (issuer, subject). */
  findOrCreate(issuer: string, subject: string): Promise<GlobalIdentity>;

  /** Find a global identity by its ID. */
  findById(id: string): Promise<GlobalIdentity | null>;
}