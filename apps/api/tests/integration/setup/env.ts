/**
 * Environment for the opt-in integration suite.
 *
 * These tests start the real Fastify app against the local docker-compose
 * PostgreSQL/Redis pair and a mock OIDC provider. They are intentionally not
 * part of `pnpm test`: run `pnpm --filter @vozlab/api test:integration` after
 * `docker compose up -d` plus `db:migrate` and `db:seed:dev`.
 *
 * Values are assigned (not `??=`) so a developer shell or a loaded `.env`
 * cannot silently point the suite at a different database or IdP.
 */
const apiPort = process.env.INTEGRATION_API_PORT ?? '13000';
const oidcPort = process.env.MOCK_OIDC_PORT ?? '18080';
const oidcOrigin = `http://127.0.0.1:${oidcPort}`;

process.env.INTEGRATION_API_PORT = apiPort;
process.env.MOCK_OIDC_PORT = oidcPort;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.LOG_PRETTY = 'false';
process.env.PORT = apiPort;
process.env.HOST = '127.0.0.1';

process.env.ROUTER_DB_HOST = 'localhost';
process.env.ROUTER_DB_PORT = '5432';
process.env.ROUTER_DB_USER = 'postgres';
process.env.ROUTER_DB_PASSWORD = 'postgres';
process.env.ROUTER_DB_NAME = 'vozlab_router';
process.env.DATABASE_POOL_MAX = '10';

process.env.TENANT_DB_HOST = 'localhost';
process.env.TENANT_DB_PORT = '5432';
process.env.TENANT_DB_USER = 'postgres';
process.env.TENANT_DB_PASSWORD = 'postgres';
process.env.TENANT_DB_NAME = 'vozlab_tenant_dev';

process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';

process.env.JWT_SECRET = 'integration-test-secret-at-least-32-chars';
process.env.EMAIL_PEPPER = 'integration-test-pepper-at-least-32-chars-xx';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

process.env.OIDC_CLIENT_ID = 'vozlab-api';
process.env.OIDC_CLIENT_SECRET = 'change-me';
process.env.OIDC_REDIRECT_URI = `http://127.0.0.1:${apiPort}/api/v1/auth/callback`;
process.env.OIDC_ISSUER = `${oidcOrigin}/realms/vozlab`;
process.env.OIDC_AUTH_URL = `${oidcOrigin}/realms/vozlab/protocol/openid-connect/auth`;
process.env.OIDC_TOKEN_URL = `${oidcOrigin}/realms/vozlab/protocol/openid-connect/token`;
process.env.OIDC_USERINFO_URL = `${oidcOrigin}/realms/vozlab/protocol/openid-connect/userinfo`;
process.env.OIDC_JWKS_URL = `${oidcOrigin}/realms/vozlab/protocol/openid-connect/certs`;
process.env.OIDC_SCOPES = 'openid profile email';
process.env.WEB_ORIGIN = 'http://localhost:5173';

process.env.RATE_LIMIT_READ_MAX = '1000';
process.env.RATE_LIMIT_WRITE_MAX = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_WORKSPACE_MULTIPLIER = '10';
