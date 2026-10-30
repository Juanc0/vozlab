/**
 * Deterministic test environment.
 *
 * `env.ts` fails fast at first access, and the logger reads `LOG_LEVEL` at
 * module load. Unit tests must not depend on a developer's `.env`, so this
 * file fills every required variable before test modules are imported.
 * Existing process values always win (`??=`), so CI can override them.
 */
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'fatal';
process.env.ROUTER_DB_HOST ??= 'localhost';
process.env.ROUTER_DB_PORT ??= '5432';
process.env.ROUTER_DB_USER ??= 'postgres';
process.env.ROUTER_DB_PASSWORD ??= 'postgres';
process.env.ROUTER_DB_NAME ??= 'vozlab_router';
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '6379';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long';
process.env.EMAIL_PEPPER ??= 'test-pepper-secret-at-least-32-characters-x';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '30d';
process.env.OIDC_CLIENT_ID ??= 'vozlab-test';
process.env.OIDC_CLIENT_SECRET ??= 'test-client-secret';
process.env.OIDC_REDIRECT_URI ??= 'http://localhost:3000/api/v1/auth/callback';
process.env.OIDC_ISSUER ??= 'https://idp.test';
process.env.OIDC_AUTH_URL ??= 'https://idp.test/auth';
process.env.OIDC_TOKEN_URL ??= 'https://idp.test/token';
process.env.OIDC_USERINFO_URL ??= 'https://idp.test/userinfo';
process.env.OIDC_JWKS_URL ??= 'https://idp.test/jwks';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
