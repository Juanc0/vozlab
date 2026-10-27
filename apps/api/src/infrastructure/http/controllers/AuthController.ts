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
      setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);
      return reply.redirect(this.webUrl(result.redirectPath));
    } catch (error) {
      log.warn(
        { err: error instanceof Error ? error.message : error },
        'OIDC callback failed'
      );
      return this.redirectError(reply, mapDomainError(error));
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
      return reply.status(204).send();
    } catch (error) {
      log.error(
        { err: error instanceof Error ? error.message : error },
        'logout failed'
      );
      return sendError(reply, mapDomainError(error));
    }
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
