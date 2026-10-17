// Cursor encode/decode and keyset predicate live here only; repositories must
// not re-implement them.
import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** Opaque cursor encoding: base64("<createdAt ISO>|<id>"). */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');
}

/**
 * Decode a keyset cursor. Returns `null` for the empty string, a missing
 * separator or an invalid date so callers can fail fast with
 * `ERR_VALIDATION_FAILED` instead of serving a silent first page.
 */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const raw = Buffer.from(cursor, 'base64').toString('utf8');
  const separator = raw.lastIndexOf('|');
  if (separator <= 0) return null;

  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;

  return { createdAt, id };
}

/** Marks a cursor for keyset paging; `direction` mirrors the ORDER BY. */
export function keysetAfter(
  createdAtColumn: AnyPgColumn,
  idColumn: AnyPgColumn,
  decoded: { createdAt: Date; id: string },
  direction: 'asc' | 'desc'
): SQL {
  // Tuple comparison mirrors the ORDER BY and stays index-friendly.
  return direction === 'desc'
    ? sql`(${createdAtColumn}, ${idColumn}) < (${decoded.createdAt}, ${decoded.id})`
    : sql`(${createdAtColumn}, ${idColumn}) > (${decoded.createdAt}, ${decoded.id})`;
}
