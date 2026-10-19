const UNIT_TO_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

type DurationUnit = keyof typeof UNIT_TO_MS;

const DURATION_RE = /^(\d+)([smhdw])$/;

/**
 * Parse a compact duration (`15m`, `30d`, `12h`, `1w`) into milliseconds.
 *
 * Used for refresh-token expiry. Access-token lifetimes are passed verbatim to
 * `jsonwebtoken`, which understands the same vocabulary.
 */
export function durationToMs(value: string): number {
  const match = DURATION_RE.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}". Use e.g. 15m, 12h, 30d.`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as DurationUnit;
  const ms = amount * UNIT_TO_MS[unit];

  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`Invalid duration "${value}": must be a positive amount.`);
  }
  return ms;
}

/** Zod-friendly predicate for env validation. */
export function isValidDuration(value: string): boolean {
  try {
    durationToMs(value);
    return true;
  } catch {
    return false;
  }
}
