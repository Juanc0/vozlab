import { FastifyRequest, FastifyReply } from 'fastify';
import {
  EventJoinSchema,
  LoginQuerySchema,
  type AuthMeDto,
  type AuthSessionDto,
  type AuthUserDto,
} from '@vozlab/shared-types';
import { env } from '../../../shared/config/env.js';
import { log } from '../../../shared/logger/index.js';
import { AuthUser } from '../../../domain/ports/IUserRepository.js';
import { StartOidcLoginUseCase } from '../../../application/use_cases/StartOidcLoginUseCase.js';
import { CompleteOidcLoginUseCase } from '../../../application/use_cases/CompleteOidcLoginUseCase.js';
import { SelectTenantUseCase } from '../../../application/use_cases/SelectTenantUseCase.js';
import { ResolveTenantsUseCase } from '../../../application/use_cases/ResolveTenantsUseCase.js';
import { RefreshSessionUseCase } from '../../../application/use_cases/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../../application/use_cases/LogoutUseCase.js';
import { GetMeUseCase } from '../../../application/use_cases/GetMeUseCase.js';
import { JoinEventUseCase } from '../../../application/use_cases/JoinEventUseCase.js';
import { ErrorCode, mapDomainError, sendError } from './errorResponse.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from '../authCookies.js';

interface OidcCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

function toAuthUserDto(user: AuthUser): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    anonymousAlias: user.anonymousAlias,
    provider: user.provider,
    systemRole: user.systemRole,
    authorHash: user.authorHash,
  };
}

/**
 * AuthController: HTTP surface for the OIDC flow and event join.
 *
 * - `/login` and `/callback` are browser redirects (302), not JSON.
 * - `/refresh` returns a short-lived access token and rotates the cookie.
 * - `/logout` and `/me` are Bearer-protected.
 * - `/event-join` is public but rate-limited; it creates an anonymous user.
 */
export class AuthController {
  constructor(
    private readonly startLogin: StartOidcLoginUseCase,
    private readonly completeLogin: CompleteOidcLoginUseCase,
    private readonly selectTenantUseCase: SelectTenantUseCase,
    private readonly resolveTenantsUseCase: ResolveTenantsUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly getMe: GetMeUseCase,
    private readonly joinEvent: JoinEventUseCase
  ) {}

  /** GET /api/v1/auth/login?redirect=/path */
  async login(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = LoginQuerySchema.safeParse(req.query);
    const redirectPath = parsed.success ? (parsed.data.redirect ?? '/') : '/';
    const kcIdpHint = parsed.success ? parsed.data.kc_idp_hint : undefined;
    const invitationToken = parsed.success ? parsed.data.invitation : undefined;

    try {
      const result = await this.startLogin.execute({
        redirectPath,
        kcIdpHint,
        invitationToken,
      });
      return reply.redirect(result.authorizationUrl);
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error },
        'failed to start OIDC login'
      );
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/auth/callback?code=...&state=... */
  async callback(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as OidcCallbackQuery;

    if (query.error) {
      log.warn(
        {
          error: query.error,
          errorDescription: query.error_description,
        },
        'identity provider rejected the login'
      );
      return this.redirectError(reply, 'ERR_OIDC_EXCHANGE_FAILED');
    }

    if (!query.code || !query.state) {
      return this.redirectError(reply, 'ERR_INVALID_OIDC_STATE');
    }

    try {
      const result = await this.completeLogin.execute({
        code: query.code,
        state: query.state,
      });
      if (result.requiresTenantSelection) {
        const gid = result.globalUserId ?? '';
        return reply.redirect(
          this.webUrl(`/select-tenant?gid=${encodeURIComponent(gid)}`)
        );
      }
      setRefreshCookie(
        reply,
        result.refreshToken as string,
        result.refreshExpiresAt as Date
      );
      return reply.redirect(this.webUrl(result.redirectPath));
    } catch (error) {
      log.warn(
        { err: error instanceof Error ? error.message : error },
        'OIDC callback failed'
      );
      return this.redirectError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/auth/select-tenant */
  async selectTenant(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = req.body as { globalUserId?: string; tenantId?: string };
    if (!body?.globalUserId || !body?.tenantId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }
    try {
      const result = await this.selectTenantUseCase.execute({
        globalUserId: body.globalUserId,
        tenantId: body.tenantId,
        refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
      });
      setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);
      return reply.send({ accessToken: result.user ? 'ok' : 'ok' });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/auth/switch-tenant (Bearer). Cambia el tenant de la sesión
   *  activa sin re-autenticar. Valida que el tenant destino esté vinculado al
   *  usuario global (`global_users`) y emite un nuevo refresh token para ese
   *  tenant. */
  async switchTenant(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = req.body as { globalUserId?: string; tenantId?: string };
    if (!body?.globalUserId || !body?.tenantId) {
      return sendError(reply, 'ERR_VALIDATION_FAILED');
    }
    try {
      const result = await this.selectTenantUseCase.execute({
        globalUserId: body.globalUserId,
        tenantId: body.tenantId,
        refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
      });
      setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);
      return reply.status(200).send({ tenantId: body.tenantId });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** GET /api/v1/auth/resolve-tenants?globalUserId=... */
  async resolveTenants(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as { globalUserId?: string };
    if (!query.globalUserId) return sendError(reply, 'ERR_VALIDATION_FAILED');
    try {
      const tenants = await this.resolveTenantsUseCase.execute({ globalUserId: query.globalUserId });
      return reply.send({ tenants });
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/auth/refresh (refresh cookie, no Authorization header) */
  async refresh(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      clearRefreshCookie(reply);
      return sendError(reply, 'ERR_REFRESH_TOKEN_INVALID');
    }

    try {
      const result = await this.refreshSession.execute({ refreshToken });
      setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);

      const body: AuthSessionDto = {
        accessToken: result.accessToken,
        expiresAt: result.accessExpiresAt.toISOString(),
        user: toAuthUserDto(result.user),
      };
      return reply.status(200).send(body);
    } catch (error) {
      clearRefreshCookie(reply);
      log.warn(
        { err: error instanceof Error ? error.message : error },
        'refresh session failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/auth/logout (Bearer + optional refresh cookie) */
  async logoutHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    clearRefreshCookie(reply);

    try {
      await this.logout.execute({
        jti: req.jti,
        tokenExpiresAt: req.tokenExpiresAt,
        refreshToken,
      });
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error },
        'logout failed'
      );
      return sendError(reply, mapDomainError(error));
    }

    // RP-initiated logout: hand the browser the identity provider's
    // end_session URL so the SSO session is terminated too. Without this,
    // clicking "Sign in" again silently reuses the IdP session.
    const endSessionBase =
      env.OIDC_END_SESSION_URL ??
      `${env.OIDC_ISSUER.replace(/\/$/, '')}/oidc/v1/end_session`;
    const endSessionUrl = `${endSessionBase}?client_id=${encodeURIComponent(
      env.OIDC_CLIENT_ID
    )}&post_logout_redirect_uri=${encodeURIComponent(env.WEB_ORIGIN)}`;

    return reply.status(200).send({ endSessionUrl });
  }

  /** GET /api/v1/auth/me (Bearer; no X-Workspace-ID) */
  async me(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = req.user?.userId;
    const tid = req.tid;
    if (!userId || !tid) {
      return sendError(reply, 'ERR_INVALID_TOKEN');
    }

    try {
      const result = await this.getMe.execute({ userId, tid });
      const body: AuthMeDto = {
        ...toAuthUserDto(result.user),
        workspaces: result.workspaces,
        globalUserId: result.globalUserId,
        tenantId: tid,
      };
      return reply.status(200).send(body);
    } catch (error) {
      return sendError(reply, mapDomainError(error));
    }
  }

  /** POST /api/v1/auth/event-join */
  async eventJoin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = EventJoinSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', {
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await this.joinEvent.execute(parsed.data);
      setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);

      const body: AuthSessionDto = {
        accessToken: result.accessToken,
        expiresAt: result.accessExpiresAt.toISOString(),
        user: toAuthUserDto(result.user),
      };
      return reply.status(200).send(body);
    } catch (error) {
      // A failed join must not log out an existing browser session: leave the
      // current refresh cookie untouched and only report the join error.
      log.warn(
        { err: error instanceof Error ? error.message : error },
        'event join failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }

  private webUrl(path: string): string {
    return new URL(path, env.WEB_ORIGIN).toString();
  }

  private redirectError(reply: FastifyReply, code: ErrorCode): void {
    const url = new URL('/auth/callback', env.WEB_ORIGIN);
    url.searchParams.set('error', code);
    reply.redirect(url.toString());
  }
}
