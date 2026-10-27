import type { WorkspaceRole } from '@vozlab/shared-types';
import type {
  IIdentityProvider,
  OidcIdentity,
  AuthorizationUrlInput,
  CodeExchangeInput,
} from '../../src/domain/ports/IIdentityProvider.js';
import type {
  IOidcStateStore,
  OidcStateData,
} from '../../src/domain/ports/IOidcStateStore.js';
import type {
  AuthUser,
  IUserRepository,
  NewAnonymousUser,
  NewOidcUser,
  UserWorkspace,
} from '../../src/domain/ports/IUserRepository.js';
import type { IRouterDatabase } from '../../src/domain/ports/IRouterDatabase.js';
import type {
  CreateRefreshTokenInput,
  IRefreshTokenRepository,
  RotateRefreshTokenInput,
  RotateRefreshTokenResult,
} from '../../src/domain/ports/IRefreshTokenRepository.js';
import type { ITokenIssuer } from '../../src/domain/ports/ITokenIssuer.js';
import type { ITokenBlacklist } from '../../src/domain/ports/ITokenBlacklist.js';
import type {
  ConsumeEventCodeResult,
  CreateEventCodeInput,
  IEventCodeRepository,
} from '../../src/domain/ports/IEventCodeRepository.js';
import type { IMembershipRepository } from '../../src/domain/ports/IMembershipRepository.js';
import type { DbTransaction } from '../../src/domain/ports/Transaction.js';

export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_KEY = 'tenant-oidc';
export const TENANT_SLUG = 'sabana';
export const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
export const USER_ID = '33333333-3333-4333-8333-333333333333';
export const AUTHOR_HASH = 'a'.repeat(64);

export const TENANT = {
  id: TENANT_ID,
  slug: TENANT_SLUG,
  oidcTenantId: TENANT_KEY,
};

export const AUTH_USER: AuthUser = {
  id: USER_ID,
  email: 'ada@example.edu',
  fullName: 'Ada Lovelace',
  provider: 'OIDC_INSTITUTIONAL',
  providerUserId: 'idp-sub-1',
  authorHash: AUTHOR_HASH,
  anonymousAlias: null,
  systemRole: 'USER',
};

export const OIDC_IDENTITY: OidcIdentity = {
  issuer: 'https://idp.test',
  subject: 'idp-sub-1',
  providerUserId: 'idp-sub-1',
  email: 'ada@example.edu',
  emailVerified: true,
  fullName: 'Ada Lovelace',
  tenantKey: TENANT_KEY,
  providerKind: 'OIDC_INSTITUTIONAL',
};

export const OIDC_STATE: OidcStateData = {
  nonce: 'nonce-1',
  codeVerifier: 'verifier-1',
  redirectPath: '/proposals',
};

export function makeRouterDb(
  options: { tenant?: typeof TENANT | null; byId?: typeof TENANT | null } = {}
): { routerDb: IRouterDatabase; calls: string[] } {
  const tenant = options.tenant === undefined ? TENANT : options.tenant;
  const byId = options.byId === undefined ? tenant : options.byId;
  const calls: string[] = [];

  const routerDb: IRouterDatabase = {
    async findTenantByOidcId(oidcTenantId) {
      calls.push(`findTenantByOidcId:${oidcTenantId}`);
      return tenant ? { id: tenant.id, slug: tenant.slug } : null;
    },
    async findTenantById(tenantId) {
      calls.push(`findTenantById:${tenantId}`);
      return byId;
    },
    async findTenantBySlug(slug) {
      calls.push(`findTenantBySlug:${slug}`);
      return byId;
    },
    async getTenantDatabaseConfig() {
      return null;
    },
    async ping() {},
  };

  return { routerDb, calls };
}

export function makeIdentityProvider(
  identity: OidcIdentity | null = OIDC_IDENTITY
): {
  identityProvider: IIdentityProvider;
  authUrlCalls: AuthorizationUrlInput[];
  exchangeCalls: CodeExchangeInput[];
} {
  const authUrlCalls: AuthorizationUrlInput[] = [];
  const exchangeCalls: CodeExchangeInput[] = [];

  const identityProvider: IIdentityProvider = {
    buildAuthorizationUrl(input) {
      authUrlCalls.push(input);
      return `https://idp.test/auth?state=${encodeURIComponent(input.state)}`;
    },
    async exchangeCode(input) {
      exchangeCalls.push(input);
      if (!identity) throw new Error('no identity configured');
      return identity;
    },
  };

  return { identityProvider, authUrlCalls, exchangeCalls };
}

export function makeStateStore(
  initial: Record<string, OidcStateData> = {}
): {
  stateStore: IOidcStateStore;
  saved: Array<{ state: string; data: OidcStateData; ttl: number }>;
  store: Map<string, OidcStateData>;
} {
  const store = new Map(Object.entries(initial));
  const saved: Array<{ state: string; data: OidcStateData; ttl: number }> = [];

  const stateStore: IOidcStateStore = {
    async save(state, data, ttl) {
      saved.push({ state, data, ttl });
      store.set(state, data);
    },
    async consume(state) {
      const data = store.get(state) ?? null;
      store.delete(state);
      return data;
    },
  };

  return { stateStore, saved, store };
}

export function makeUserRepository(
  options: {
    user?: AuthUser | null;
    workspaces?: UserWorkspace[];
  } = {}
): {
  userRepo: IUserRepository;
  oidcUpserts: Array<{ input: NewOidcUser; tid: string }>;
  anonymousCreates: Array<{ input: NewAnonymousUser; tid: string; tx?: DbTransaction }>;
} {
  const user = options.user === undefined ? AUTH_USER : options.user;
  const workspaces = options.workspaces ?? [];
  const oidcUpserts: Array<{ input: NewOidcUser; tid: string }> = [];
  const anonymousCreates: Array<{
    input: NewAnonymousUser;
    tid: string;
    tx?: DbTransaction;
  }> = [];

  const userRepo: IUserRepository = {
    async findById() {
      return user;
    },
    async findOrCreateOidcUser(input, tid) {
      oidcUpserts.push({ input, tid });
      return user ?? AUTH_USER;
    },
    async createAnonymousUser(input, tid, tx) {
      anonymousCreates.push({ input, tid, tx });
      return {
        ...AUTH_USER,
        id: '44444444-4444-4444-8444-444444444444',
        email: null,
        fullName: null,
        provider: 'ANONYMOUS_EVENT',
        providerUserId: null,
        authorHash: input.authorHash,
        anonymousAlias: input.alias,
      };
    },
    async listWorkspaces() {
      return workspaces;
    },
  };

  return { userRepo, oidcUpserts, anonymousCreates };
}

export function makeRefreshTokenRepository(
  rotation: RotateRefreshTokenResult = {
    status: 'OK',
    userId: USER_ID,
    familyId: 'family-1',
  }
): {
  refreshRepo: IRefreshTokenRepository;
  creates: Array<{ input: CreateRefreshTokenInput; tid: string; tx?: DbTransaction }>;
  rotations: Array<{ input: RotateRefreshTokenInput; tid: string }>;
  revokedHashes: string[];
  revokedFamilies: string[];
} {
  const creates: Array<{
    input: CreateRefreshTokenInput;
    tid: string;
    tx?: DbTransaction;
  }> = [];
  const rotations: Array<{ input: RotateRefreshTokenInput; tid: string }> = [];
  const revokedHashes: string[] = [];
  const revokedFamilies: string[] = [];

  const refreshRepo: IRefreshTokenRepository = {
    async create(input, tid, tx) {
      creates.push({ input, tid, tx });
    },
    async rotate(input, tid) {
      rotations.push({ input, tid });
      return rotation;
    },
    async revokeFamilyByHash(tokenHash) {
      revokedHashes.push(tokenHash);
    },
    async revokeFamily(familyId) {
      revokedFamilies.push(familyId);
    },
  };

  return { refreshRepo, creates, rotations, revokedHashes, revokedFamilies };
}

export function makeTokenIssuer(): {
  tokenIssuer: ITokenIssuer;
  issued: Array<{ userId: string; tenantKey: string; authorHash: string }>;
} {
  let counter = 0;
  const issued: Array<{ userId: string; tenantKey: string; authorHash: string }> =
    [];

  const tokenIssuer: ITokenIssuer = {
    issue(input) {
      counter += 1;
      issued.push({
        userId: input.userId,
        tenantKey: input.tenantKey,
        authorHash: input.authorHash,
      });
      return {
        token: `access-token-${counter}`,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      };
    },
  };

  return { tokenIssuer, issued };
}

export function makeEventCodeRepository(
  result: ConsumeEventCodeResult
): {
  eventCodeRepo: IEventCodeRepository;
  consumedHashes: string[];
  created: CreateEventCodeInput[];
} {
  const consumedHashes: string[] = [];
  const created: CreateEventCodeInput[] = [];

  const eventCodeRepo: IEventCodeRepository = {
    async consume(codeHash) {
      consumedHashes.push(codeHash);
      return result;
    },
    async create(input) {
      created.push(input);
      return { id: 'code-1' };
    },
  };

  return { eventCodeRepo, consumedHashes, created };
}

export function makeMembershipRepository(): {
  membershipRepo: IMembershipRepository;
  added: Array<{ userId: string; workspaceId: string; role: WorkspaceRole; tid: string; tx?: DbTransaction }>;
} {
  const added: Array<{
    userId: string;
    workspaceId: string;
    role: WorkspaceRole;
    tid: string;
    tx?: DbTransaction;
  }> = [];

  const membershipRepo: IMembershipRepository = {
    async isMember() {
      return true;
    },
    async getRole() {
      return 'MEMBER';
    },
    async add(userId, workspaceId, role, tid, tx) {
      added.push({ userId, workspaceId, role, tid, tx });
    },
  };

  return { membershipRepo, added };
}

export function makeTokenBlacklist(): {
  blacklist: ITokenBlacklist;
  revoked: Array<{ jti: string; ttlSeconds: number }>;
} {
  const revoked: Array<{ jti: string; ttlSeconds: number }> = [];
  const blacklist: ITokenBlacklist = {
    async isBlacklisted() {
      return false;
    },
    async revoke(jti, ttlSeconds) {
      revoked.push({ jti, ttlSeconds });
    },
  };
  return { blacklist, revoked };
}
