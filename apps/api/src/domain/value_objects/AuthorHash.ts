/**
 * Value Object: AuthorHash
 *
 * Implements pseudonymity (RF-07, RNF-07). Wraps the opaque 64-hex
 * pseudonym assigned to a user at account creation and stored on
 * `auth.users.author_hash`; the token carries it verbatim (the API never
 * derives it from the identity, and no salt exists). Personal data is
 * therefore never directly visible in the knowledge graph.
 *
 * Fixtures (dev seed / tests) mint these values deterministically; the
 * production auth flow will generate a random one per user.
 */
export class AuthorHash {
  private readonly value: string;

  private constructor(hash: string) {
    if (!AuthorHash.isValid(hash)) {
      throw new Error(`Invalid AuthorHash: "${hash}" is not a valid 64-char hex SHA-256 hash`);
    }
    this.value = hash.toLowerCase();
  }

  /**
   * Create an AuthorHash from an existing valid hex string.
   */
  public static fromString(hash: string): AuthorHash {
    return new AuthorHash(hash);
  }

  /**
   * Validates if a string is a valid 64-character hex SHA-256 string.
   */
  public static isValid(candidate: string): boolean {
    return typeof candidate === 'string' && /^[a-fA-F0-9]{64}$/.test(candidate);
  }

  public toString(): string {
    return this.value;
  }

  public equals(other: AuthorHash): boolean {
    return this.value === other.value;
  }
}