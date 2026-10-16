import { createHash } from 'node:crypto';

/**
 * Value Object: AuthorHash
 *
 * Implements pseudonymity (RF-07, RNF-07).
 * Wraps a SHA-256 hash derived from the user's institutional identity
 * or anonymous device token + salt. Ensures personal data is never
 * directly visible in the knowledge graph.
 */
export class AuthorHash {
  private readonly value: string;

  private constructor(hash: string) {
    if (!AuthorHash.isValid(hash)) {
      throw new Error(`ERR_INVALID_AUTHOR_HASH: "${hash}" is not a valid 64-char hex SHA-256 hash`);
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
   * Derive an AuthorHash from a user identifier and an institutional salt.
   */
  public static fromIdentity(userId: string, salt: string): AuthorHash {
    if (!userId || !salt) {
      throw new Error('ERR_INVALID_AUTHOR_HASH: userId and salt are required');
    }
    const hash = createHash('sha256')
      .update(`${userId}:${salt}`)
      .digest('hex');
    return new AuthorHash(hash);
  }

  /**
   * Build an AuthorHash from a raw value that may be either an already
   * hashed identity or a plain identifier (e.g. an OIDC subject).
   * Falls back to deterministic derivation with the given salt.
   *
   * Centralizes the "valid hash or derive" rule so use cases don't
   * duplicate it (pseudonymity: RF-07, RNF-07).
   */
  public static fromRawOrIdentity(value: string, salt: string): AuthorHash {
    return AuthorHash.isValid(value)
      ? AuthorHash.fromString(value)
      : AuthorHash.fromIdentity(value, salt);
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