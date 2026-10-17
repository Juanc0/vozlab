/**
 * DEV JWT MINTING — DEVELOPMENT ONLY.
 *
 * Mints a short-lived HS256 JWT accepted by `AuthGuard` for one of the seeded
 * dev identities, so every endpoint can be exercised locally with no IdP.
 * Never wire this into app startup, `db:migrate` or CI; it is a developer
 * convenience only and the token is printed at runtime (never committed).
 *
 * The `JWT_SECRET` must be the exact value the API boots with. `env.ts`
 * enforces a minimum length of 32 chars, so this script refuses shorter ones.
 *
 * Claims minted (see `AuthGuard`):
 *   sub        identity UUID (`auth.users.id`) — membership is keyed by it
 *   tid        `sabana` — must match `tenants.oidc_tenant_id`
 *   jti        fresh UUID — Redis blacklist key
 *   authorHash identity SHA-256 — pseudonymous author (FR-12)
 *   type       only for the `agent` identity (e.g. `AGENT_EXTRACTOR`)
 *
 * Usage:
 *   pnpm --filter @vozlab/database db:mint-token -- --as maintainer
 */
import { randomUUID } from 'node:crypto';
import {
  DEV_IDENTITIES,
  DEV_IDENTITY_NAMES,
  OIDC_TENANT_ID,
  WORKSPACE_ID,
  type DevIdentityName,
} from './dev-identities.js';

/** Matches `env.ts` — a shorter secret is rejected by the API at boot. */
const MIN_SECRET_LENGTH = 32;
const TOKEN_TTL = '12h';

const VALID_NAMES = DEV_IDENTITY_NAMES.join('|');

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function isIdentityName(value: string): value is DevIdentityName {
  return Object.prototype.hasOwnProperty.call(DEV_IDENTITIES, value);
}

/** Parse `--as <name>` / `--as=<name>`; defaults to `maintainer`. */
function resolveIdentityName(argv: readonly string[]): DevIdentityName {
  let name: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // pnpm forwards the `--` separator verbatim (`... tsx <script> -- --as x`).
    if (arg === undefined || arg === '--') continue;

    if (arg === '--as') {
      name = argv[i + 1];
      if (name === undefined || name === '--') {
        fail(`--as requires a value. Valid identities: ${VALID_NAMES}`);
      }
      i += 1;
    } else if (arg.startsWith('--as=')) {
      name = arg.slice('--as='.length);
    } else {
      fail(
        `Unknown argument "${arg}". Usage: db:mint-token -- --as <${VALID_NAMES}>`,
      );
    }
  }

  if (name === undefined) return 'maintainer';
  if (!isIdentityName(name)) {
    fail(`Unknown identity "${name}". Valid identities: ${VALID_NAMES}`);
  }
  return name;
}

/** Load `jsonwebtoken`, or exit non-zero with install guidance. */
async function loadJwt(): Promise<typeof import('jsonwebtoken')> {
  try {
    const mod =
      (await import('jsonwebtoken')) as typeof import('jsonwebtoken') & {
        default?: typeof import('jsonwebtoken');
      };
    return mod.default ?? mod;
  } catch {
    fail(
      "Cannot load 'jsonwebtoken'. Install it in the database package:\n" +
        '  pnpm --filter @vozlab/database add -D jsonwebtoken @types/jsonwebtoken',
    );
  }
}

async function main(): Promise<void> {
  const name = resolveIdentityName(process.argv.slice(2));
  const identity = DEV_IDENTITIES[name];

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    fail(
      `JWT_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters.\n` +
        'Use the same value the API boots with, e.g.:\n' +
        `  JWT_SECRET=$(openssl rand -hex 32) pnpm --filter @vozlab/database db:mint-token -- --as ${name}`,
    );
  }

  const jwt = await loadJwt();

  const claims: Record<string, unknown> = {
    sub: identity.sub,
    tid: OIDC_TENANT_ID,
    jti: randomUUID(),
    authorHash: identity.authorHash,
  };
  if (identity.agentType) claims.type = identity.agentType;

  const token = jwt.sign(claims, secret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });

  const typeLine = identity.agentType
    ? `\n  type        ${identity.agentType}`
    : '';

  console.log(`\n🔐 Dev JWT — identity "${name}" (expires in ${TOKEN_TTL})\n`);
  console.log(`  sub         ${identity.sub}`);
  console.log(`  tid         ${OIDC_TENANT_ID}`);
  console.log(`  authorHash  ${identity.authorHash}${typeLine}`);
  console.log(`\n${token}\n`);
  console.log('Send it as:');
  console.log(`  Authorization: Bearer ${token}`);
  console.log(`  X-Workspace-ID: ${WORKSPACE_ID}`);
  console.log('\nExample:');
  console.log(`  curl -s http://localhost:3000/api/v1/nodes \\`);
  console.log(`    -H "Authorization: Bearer ${token}" \\`);
  console.log(`    -H "X-Workspace-ID: ${WORKSPACE_ID}"\n`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Dev token minting failed:', message, '\n');
    process.exit(1);
  });
