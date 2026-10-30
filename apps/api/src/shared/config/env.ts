import { z } from 'zod';
import { isValidDuration } from '../time/duration.js';

/**
 * Strongly-typed environment validation for the Fastify API.
 * Fails fast at startup if any required variable is missing.
 */

const EnvSchema = z
  .object({
    // --- Server ---
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().min(1).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),

    // --- Database (Router) ---
    ROUTER_DB_HOST: z.string().min(1, 'ROUTER_DB_HOST is required'),
    ROUTER_DB_PORT: z.coerce.number().min(1).max(65535).default(5432),
    ROUTER_DB_USER: z.string().min(1, 'ROUTER_DB_USER is required'),
    ROUTER_DB_PASSWORD: z.string().min(1, 'ROUTER_DB_PASSWORD is required'),
    ROUTER_DB_NAME: z.string().min(1, 'ROUTER_DB_NAME is required'),
    ROUTER_DB_MAX_CONNECTIONS: z.coerce.number().default(20),
    DATABASE_POOL_MAX: z.coerce.number().default(10),

    // --- Redis ---
    REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
    REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
    REDIS_PASSWORD: z.string().optional().default(''),
    REDIS_TLS: z.coerce.boolean().optional().default(false),
    // --- Identity / JWT ---
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
    JWT_EXPIRES_IN: z
      .string()
      .refine(isValidDuration, 'JWT_EXPIRES_IN must look like 15m, 12h or 30d')
      .default('15m'),
    JWT_REFRESH_EXPIRES_IN: z
      .string()
      .refine(
        isValidDuration,
        'JWT_REFRESH_EXPIRES_IN must look like 15m, 12h or 30d'
      )
      .default('30d'),
    // HMAC key for every email-derived hash (DEC-4,
    // docs/analysis/db-identity-normalization.md). Required like JWT_SECRET.
    EMAIL_PEPPER: z.string().min(32, 'EMAIL_PEPPER must be at least 32 chars'),

    // --- OIDC (delegated identity) ---
    OIDC_CLIENT_ID: z.string().min(1, 'OIDC_CLIENT_ID is required'),
    OIDC_CLIENT_SECRET: z.string().min(1, 'OIDC_CLIENT_SECRET is required'),
    OIDC_REDIRECT_URI: z.string().url('OIDC_REDIRECT_URI must be a valid URL'),
    OIDC_ISSUER: z.string().url('OIDC_ISSUER must be a valid URL'),
    OIDC_AUTH_URL: z.string().url('OIDC_AUTH_URL must be a valid URL'),
    OIDC_TOKEN_URL: z.string().url('OIDC_TOKEN_URL must be a valid URL'),
    OIDC_USERINFO_URL: z.string().url('OIDC_USERINFO_URL must be a valid URL'),
    OIDC_JWKS_URL: z.string().url('OIDC_JWKS_URL must be a valid URL'),
    OIDC_SCOPES: z.string().default('openid profile email'),
    // RP-initiated logout (optional; derived from OIDC_ISSUER if absent).
    OIDC_END_SESSION_URL: z.string().url().optional(),

    // --- Web client ---
    // PWA origin used for CORS and as the post-login redirect base.
    WEB_ORIGIN: z.string().url('WEB_ORIGIN must be a valid URL'),

    // --- LLM / Embeddings ---
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
    EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
    EMBEDDING_DIMENSIONS: z.coerce.number().default(768),

    // --- Rate limiting ---
    RATE_LIMIT_READ_MAX: z.coerce.number().default(300),
    RATE_LIMIT_WRITE_MAX: z.coerce.number().default(30),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
    // Coarse per-workspace ceiling = per-actor max × this factor.
    RATE_LIMIT_WORKSPACE_MULTIPLIER: z.coerce.number().int().min(1).default(10),

    // --- Observability ---
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    LOG_PRETTY: z.coerce.boolean().default(false),
  });

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

/**
 * Validates and caches the environment variables.
 * Throws a ZodError at startup if validation fails.
 */
export function loadEnv(): Env {
  if (_env) return _env;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Print structured errors and exit — Fastify is not yet started.
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

/** Cached, validated environment accessor. */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    const e = loadEnv();
    return e[prop as keyof Env];
  },
});
