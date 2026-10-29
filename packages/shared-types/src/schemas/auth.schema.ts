import { z } from 'zod';
import { WorkspaceRoleSchema } from './roles.schema.js';

/**
 * Auth contracts shared by the API and the (future) PWA.
 *
 * The access token is a short-lived HS256 JWT sent as
 * `Authorization: Bearer <jwt>`. The refresh token is an opaque value carried
 * in an `HttpOnly` cookie and never exposed to JavaScript.
 */

/**
 * A redirect path that cannot escape the PWA origin.
 *
 * `new URL('/\\evil.example', origin)` normalizes the backslash to `//` and
 * produces an external origin, so `//` alone is not enough. Reject backslashes
 * and control characters as well.
 */
export function isSafeRedirectPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 500 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return false;
  }

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/** `GET /api/v1/auth/login?redirect=/proposals` — relative paths only. */
export const LoginQuerySchema = z.object({
  redirect: z
    .string()
    .max(500)
    .refine(isSafeRedirectPath, {
      message: 'redirect must be an absolute path on the same origin',
    })
    .optional(),
  institution: z.string().max(100).optional(),
  kc_idp_hint: z.string().max(100).optional(),
  invitation: z.string().max(500).optional(),
});
export type LoginQuery = z.infer<typeof LoginQuerySchema>;

/**
 * `POST /api/v1/auth/event-join`.
 *
 * The code is the raw value encoded in the event QR. It is hashed by the API
 * before the global registry lookup; it never appears in logs.
 */
export const EventJoinSchema = z.object({
  code: z.string().trim().min(16).max(128),
  alias: z.string().trim().min(1).max(100).optional(),
});
export type EventJoinInput = z.infer<typeof EventJoinSchema>;

/** Public identity of the authenticated caller (never includes PII of others). */
export interface AuthUserDto {
  id: string;
  email: string | null;
  fullName: string | null;
  /** Alias shown for event/anonymous users; `null` for institutional users. */
  anonymousAlias: string | null;
  provider: string;
  systemRole: string;
  authorHash: string;
}

export interface WorkspaceSummaryDto {
  id: string;
  slug: string;
  name: string;
  role: z.infer<typeof WorkspaceRoleSchema>;
}

export interface AuthSessionDto {
  accessToken: string;
  /** ISO-8601 instant at which the access token expires. */
  expiresAt: string;
  user: AuthUserDto;
}

export interface AuthMeDto extends AuthUserDto {
  workspaces: WorkspaceSummaryDto[];
  /**
   * Router-DB global identity for the tenant user, when linked. The PWA
   * needs it for `POST /auth/switch-tenant` (tenant selector, v6/TASK-01).
   */
  globalUserId: string | null;
  /** Internal UUID of the tenant the session is acting in. */
  tenantId: string;
}
