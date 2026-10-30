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
import type { AuditEvent, IAuditLog } from '../../src/domain/ports/IAuditLog.js';
import type {
  AuthUser,
  IUserRepository,
  NewAnonymousUser,
  UserWorkspace,
} from '../../src/domain/ports/IUserRepository.js';
import type { IRouterDatabase } from '../../src/domain/ports/IRouterDatabase.js';
import type {
  GlobalUserProfile,
  IGlobalUserRepository,
} from '../../src/domain/ports/IGlobalUserRepository.js';
import type {
  GlobalInvitationRecord,
  IGlobalInvitationRepository,
} from '../../src/domain/ports/IGlobalInvitationRepository.js';
import type {
  Invitation,
  IInvitationRepository,
} from '../../src/domain/ports/IInvitationRepository.js';
import type {
  CreateRefreshTokenInput,
  IRefreshTokenRepository,
  RotateRefreshTokenInput,
  RotateRefreshTokenResult,
} from '../../src/domain/ports/IRefreshTokenRepository.js';
import type { ITokenIssuer } from '../../src/domain/ports/ITokenIssuer.js';
import type { ITokenBlacklist } from '../../src/domain/ports/ITokenBlacklist.js';
import type {
  CredentialRouteKind,
  ICredentialRouteRepository,
} from '../../src/domain/ports/ICredentialRouteRepository.js';
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
  fullName: 'Ada Lovelace',
  provider: 'OIDC_INSTITUTIONAL',
  providerUserId: 'idp-sub-1',
  authorHash: AUTHOR_HASH,
  anonymousAlias: null,
  systemRole: 'USER',
  sessionsValidAfter: null,
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

export function makeGlobalUserRepository(): {
  repo: IGlobalUserRepository;
  calls: string[];
  /** Profile argument of every `findOrCreate` (audit P7.4 assertions). */
  profiles: Array<GlobalUserProfile | undefined>;
} {
  const calls: string[] = [];
  const profiles: Array<GlobalUserProfile | undefined> = [];
  const repo: IGlobalUserRepository = {
    async findOrCreate(issuer, subject, profile) {
      calls.push(`findOrCreate:${issuer}:${subject}`);
      profiles.push(profile);
      return {
        id: 'global-id-1',
        issuer,
        subject,
        emailHash: profile?.emailHash ?? null,
        emailVerified: profile?.emailVerified ?? false,
        fullName: profile?.fullName ?? null,
        picture: profile?.picture ?? null,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        lastSeenAt: new Date(),
      };
    },
    async updateProfile() {},
    async findById(id) {
      calls.push(`findById:${id}`);
      return {
        id,
        issuer: 'https://idp.test',
        subject: 'idp-sub-1',
        emailHash: null,
        emailVerified: false,
        fullName: null,
        picture: null,
        lastLoginAt: null,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      };
    },
  };
  return { repo, calls, profiles };
}

export function makeRouterDb(
  options: {
    tenant?: typeof TENANT | null;
    byId?: typeof TENANT | null;
    /** Value returned by `findGlobalUserIdForTenantUser`. */
    globalUserId?: string;
  } = {}
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
    async findTenantsByGlobalUser(globalUserId) {
      calls.push(`findTenantsByGlobalUser:${globalUserId}`);
      return tenant ? [{ id: tenant.id, slug: tenant.slug, oidcTenantId: tenant.oidcTenantId ?? 'oidc-1', status: 'ACTIVE' }] : [];
    },
    async findGlobalUserTenantLink() {
      return null;
    },
    async linkGlobalUserTenant(globalUserId, tenantId, tenantUserId, status) {
      calls.push(`linkGlobalUserTenant:${globalUserId}:${tenantId}:${tenantUserId}:${status}`);
    },
    async findGlobalUserIdForTenantUser(tenantId, tenantUserId) {
      calls.push(`findGlobalUserIdForTenantUser:${tenantId}:${tenantUserId}`);
      return options.globalUserId ?? null;
    },
  };

  return { routerDb, calls };
}

export function makeGlobalInvitationRepository(
  seed: GlobalInvitationRecord[] = []
): {
  repo: IGlobalInvitationRepository;
  records: GlobalInvitationRecord[];
  accepts: string[];
} {
  const records = [...seed];
  const accepts: string[] = [];

  const repo: IGlobalInvitationRepository = {
    async createInvitation(input) {
      const record: GlobalInvitationRecord = {
        id: `global-inv-${records.length + 1}`,
        tokenHash: input.tokenHash,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        role: input.role,
        email: input.email,
        status: 'PENDING',
        maxUses: input.maxUses ?? null,
        usedCount: 0,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };
      records.push(record);
      return record;
    },
    async findByTokenHash(tokenHash) {
      return records.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async accept(id) {
      accepts.push(id);
      const record = records.find((r) => r.id === id);
      if (!record || record.status !== 'PENDING') return false;
      record.status = 'ACCEPTED';
      record.usedCount += 1;
      return true;
    },
  };

  return { repo, records, accepts };
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
    /** Value returned by `removeInactiveGuests`. */
    removedGuests?: number;
  } = {}
): {
  userRepo: IUserRepository;
  oidcUpserts: Array<{ input: unknown; tid: string }>;
  anonymousCreates: Array<{ input: NewAnonymousUser; tid: string; tx?: DbTransaction }>;
  guestSweeps: Array<{ tid: string; cutoff: Date }>;
} {
  const user = options.user === undefined ? AUTH_USER : options.user;
  const workspaces = options.workspaces ?? [];
  const oidcUpserts: Array<{ input: unknown; tid: string }> = [];
  const anonymousCreates: Array<{
    input: NewAnonymousUser;
    tid: string;
    tx?: DbTransaction;
  }> = [];
  const guestSweeps: Array<{ tid: string; cutoff: Date }> = [];

  const userRepo: IUserRepository = {
    async findById() {
      return user;
    },
    async findByHandle() {
      return user;
    },
    async findOrCreateByExternalIdentity(input, tid) {
      oidcUpserts.push({ input, tid });
      return user ?? AUTH_USER;
    },
    async createAnonymousUser(input, tid, tx) {
      anonymousCreates.push({ input, tid, tx });
      return {
        ...AUTH_USER,
        id: '44444444-4444-4444-8444-444444444444',
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
    async removeInactiveGuests(tid, cutoff) {
      guestSweeps.push({ tid, cutoff });
      return options.removedGuests ?? 0;
    },
  };

  return { userRepo, oidcUpserts, anonymousCreates, guestSweeps };
}

export function makeRefreshTokenRepository(
  rotation: RotateRefreshTokenResult = {
    status: 'OK',
    userId: USER_ID,
    familyId: 'family-1',
    createdAt: new Date(),
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
    async revokeAllForUser() {},
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

/**
 * Fake `ICredentialRouteRepository` (ADR-0046): a hash→tenant directory.
 * `routes` maps `"<hash>:<kind>"` to the tenant id, so cross-kind lookups
 * miss exactly like the kind-filtered SQL does.
 */
export function makeCredentialRouteRepository(
  routes: Record<string, string> = {}
): {
  credentialRoutes: ICredentialRouteRepository;
  lookups: Array<{ hash: string; kind: CredentialRouteKind }>;
  addRoute(hash: string, kind: CredentialRouteKind, tenantId: string): void;
} {
  const table = new Map(Object.entries(routes));
  const lookups: Array<{ hash: string; kind: CredentialRouteKind }> = [];

  const credentialRoutes: ICredentialRouteRepository = {
    async findTenantId(credentialHash, kind) {
      lookups.push({ hash: credentialHash, kind });
      return table.get(`${credentialHash}:${kind}`) ?? null;
    },
  };

  return {
    credentialRoutes,
    lookups,
    addRoute(hash, kind, tenantId) {
      table.set(`${hash}:${kind}`, tenantId);
    },
  };
}

export function makeInvitationRepository(seed?: {
  /** What `findByTokenHash` answers (the D9 lookup). Default `null`. */
  byTokenHash?: Invitation | null;
  /** What `accept` answers — `false` simulates the concurrent-loser race. */
  acceptResult?: boolean;
}): {
  repo: IInvitationRepository;
  calls: string[];
} {
  const calls: string[] = [];
  const repo: IInvitationRepository = {
    async findByTokenHash(tokenHash, tid) {
      calls.push(`findByTokenHash:${tokenHash}`);
      return seed?.byTokenHash ?? null;
    },
    async accept(id, tid) {
      calls.push(`accept:${id}`);
      return seed?.acceptResult ?? true;
    },
    async revoke(id, tid) {
      calls.push(`revoke:${id}`);
    },
    async expirePending(tid, now) {
      return 0;
    },
    async create(input, tid) {
      calls.push(`create:${input.workspaceId}`);
      return {
        id: 'inv-1',
        workspaceId: input.workspaceId,
        emailHash: input.emailHash ?? null,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses ?? null,
        usedCount: 0,
        status: 'PENDING',
        revokedAt: null,
        createdBy: input.createdBy ?? null,
        createdAt: new Date(),
      };
    },
  };
  return { repo, calls };
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
    async getRoles() {
      return ['MEMBER'];
    },
    async add(userId, workspaceId, role, tid, tx) {
      added.push({ userId, workspaceId, role, tid, tx });
    },
    async changeRole() {},
    async suspend() {},
    async reactivate() {},
    async remove() {},
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

/**
 * B12: in-memory audit sink. Tests assert the identity trail (`OIDC_LOGIN`,
 * `TENANT_SELECTED`, `INVITATION_REDEEMED`) without a database: the fake
 * keeps every event, and `DrizzleAuditLog`'s routing rules are covered by
 * its own tests.
 */
export function makeAuditLog(): {
  audit: IAuditLog;
  events: AuditEvent[];
} {
  const events: AuditEvent[] = [];
  return {
    audit: {
      async record(event) {
        events.push(event);
      },
    },
    events,
  };
}
