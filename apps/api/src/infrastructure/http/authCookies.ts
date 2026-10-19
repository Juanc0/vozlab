import type { FastifyReply } from 'fastify';
import '@fastify/cookie';
import { env } from '../../shared/config/env.js';

/**
 * Refresh-token cookie policy.
 *
 * - `HttpOnly`: JavaScript (and therefore XSS) cannot read the credential.
 * - `SameSite=Lax`: the PWA and API share a site in production
 *   (`app.`/`api.` subdomains); Lax blocks cross-site POSTs (CSRF) while still
 *   allowing the top-level OIDC redirect back to the API.
 * - `Path=/api/v1/auth`: only auth endpoints receive it; graph requests use
 *   the Bearer access token and are not exposed to automatic cookie replay.
 * - `Secure` in production; localhost development is HTTP.
 */
export const REFRESH_COOKIE_NAME = 'vozlab_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date
): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}
