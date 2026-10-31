import type { WorkspaceRole } from '@vozlab/shared-types';
import type {
  AdminMembershipRecord,
  IMembershipAdminRepository,
  MembershipAuditEventInput,
} from '../../src/domain/ports/IMembershipAdminRepository.js';
import type {
  IJoinRequestRepository,
  JoinRequestRecord,
  JoinRequestStatus,
  JoinRequestWithUser,
  JoinRequestWithWorkspace,
} from '../../src/domain/ports/IJoinRequestRepository.js';
import type { IInvitationAdminRepository } from '../../src/domain/ports/IInvitationAdminRepository.js';
import type { Invitation } from '../../src/domain/ports/IInvitationRepository.js';
import type {
  ITenantAdminRepository,
  ListTenantUsersInput,
  ListTenantUsersResult,
  TenantUserRecord,
} from '../../src/domain/ports/ITenantAdminRepository.js';
import type {
  CreateWorkspaceRecordInput,
  DiscoveredWorkspace,
  IWorkspaceRepository,
  UpdateWorkspacePatch,
  WorkspaceRecord,
  WorkspaceWithStats,
} from '../../src/domain/ports/IWorkspaceRepository.js';
import type {
  CreateWorkspaceJoinCodeInput,
  IWorkspaceJoinCodeRepository,
  JoinCodePurpose,
  WorkspaceJoinCodeRecord,
} from '../../src/domain/ports/IWorkspaceJoinCodeRepository.js';
import type { DbTransaction } from '../../src/domain/ports/Transaction.js';

const NOW = new Date('2026-10-01T12:00:00.000Z');

export const ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MEMBER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const OTHER_ADMIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const NEW_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export function workspaceRecord(
  overrides: Partial<WorkspaceRecord> = {}
): WorkspaceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'general',
    name: 'General',
    description: null,
    isPublic: true,
    kind: 'PRIVATE',
    createdAt: NOW,
    ...overrides,
  };
}

export function membershipRecord(
  overrides: Partial<AdminMembershipRecord> & {
    workspaceId?: string;
  } = {}
): AdminMembershipRecord & { workspaceId: string } {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    userId: MEMBER_USER_ID,
    handle: 'member-handle',
    fullName: 'Member',
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: NOW,
    ...overrides,
  };
}

export function makeWorkspaceRepository(initial: WorkspaceRecord[] = []): {
  repo: IWorkspaceRepository;
  rows: Map<string, WorkspaceRecord>;
  updates: Array<{ workspaceId: string; patch: UpdateWorkspacePatch }>;
  locked: string[];
} {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const updates: Array<{ workspaceId: string; patch: UpdateWorkspacePatch }> = [];
  const locked: string[] = [];

  const withStats = (row: WorkspaceRecord): WorkspaceWithStats => ({
    ...row,
    memberCount: 0,
    pendingRequestCount: 0,
  });

  const repo: IWorkspaceRepository = {
    async create(input: CreateWorkspaceRecordInput) {
      const row: WorkspaceRecord = {
        id: `ws-${rows.size + 1}`,
        slug: input.slug,
        name: input.name,
        description: input.description,
        isPublic: input.isPublic,
        kind: input.kind ?? 'PRIVATE',
        createdAt: NOW,
      };
      rows.set(row.id, row);
      return row;
    },
    async update(workspaceId: string, patch: UpdateWorkspacePatch) {
      updates.push({ workspaceId, patch });
      const row = rows.get(workspaceId);
      if (!row) return null;
      const next = { ...row, ...patch };
      rows.set(workspaceId, next);
      return next;
    },
    async lockById(workspaceId: string) {
      locked.push(workspaceId);
      return rows.get(workspaceId) ?? null;
    },
    async findById(workspaceId: string) {
      return rows.get(workspaceId) ?? null;
    },
    async findBySlug(slug: string) {
      return [...rows.values()].find((row) => row.slug === slug) ?? null;
    },
    async listWithStats() {
      return [...rows.values()].map(withStats);
    },
    async getStats(workspaceId: string) {
      const row = rows.get(workspaceId);
      return row ? withStats(row) : null;
    },
    async listPublicForUser(): Promise<DiscoveredWorkspace[]> {
      return [...rows.values()]
        .filter((row) => row.isPublic)
        .map((row) => ({ ...row, pendingRequest: false }));
    },
  };

  return { repo, rows, updates, locked };
}

interface StoredMembership extends AdminMembershipRecord {
  workspaceId: string;
  tx?: DbTransaction;
}

export function makeMembershipAdminRepository(
  initial: StoredMembership[] = []
): {
  repo: IMembershipAdminRepository;
  members: Map<string, StoredMembership>;
  events: MembershipAuditEventInput[];
} {
  const members = new Map(
    initial.map((member) => [`${member.workspaceId}:${member.userId}`, member])
  );
  const events: MembershipAuditEventInput[] = [];

  const repo: IMembershipAdminRepository = {
    async find(userId, workspaceId) {
      return members.get(`${workspaceId}:${userId}`) ?? null;
    },
    async listByWorkspace(workspaceId) {
      return [...members.values()].filter((m) => m.workspaceId === workspaceId);
    },
    async upsertMember(input, _tid, tx) {
      const key = `${input.workspaceId}:${input.userId}`;
      const current = members.get(key);
      members.set(key, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        handle: current?.handle ?? null,
        fullName: current?.fullName ?? null,
        role: input.role,
        status: 'ACTIVE',
        joinedAt: current?.joinedAt ?? NOW,
        tx,
      });
    },
    async removeRole(userId, workspaceId, role, _tid, tx) {
      const key = `${workspaceId}:${userId}`;
      const current = members.get(key);
      if (current && current.role === role) {
        members.delete(key);
      }
    },
    async countActiveAdmins(workspaceId) {
      return [...members.values()].filter(
        (m) =>
          m.workspaceId === workspaceId &&
          m.role === 'ADMIN' &&
          m.status === 'ACTIVE'
      ).length;
    },
    async recordEvent(input) {
      events.push(input);
    },
  };

  return { repo, members, events };
}

export function makeTenantAdminRepository(users: TenantUserRecord[] = []): {
  repo: ITenantAdminRepository;
  users: TenantUserRecord[];
} {
  const repo: ITenantAdminRepository = {
    async listUsers(
      input: ListTenantUsersInput
    ): Promise<ListTenantUsersResult> {
      const search = input.search?.toLowerCase();
      const filtered = users.filter((user) => {
        if (!search) return true;
        return (
          user.handle?.toLowerCase().includes(search) ||
          user.fullName?.toLowerCase().includes(search)
        );
      });
      return { users: filtered.slice(0, input.limit), nextCursor: null };
    },
    async findUserById(userId) {
      return users.find((user) => user.id === userId) ?? null;
    },
  };
  return { repo, users };
}

export function tenantUser(
  overrides: Partial<TenantUserRecord> = {}
): TenantUserRecord {
  return {
    id: MEMBER_USER_ID,
    handle: 'member-handle',
    fullName: 'Member',
    provider: 'OIDC_INSTITUTIONAL',
    systemRole: 'USER',
    authorHash: 'b'.repeat(64),
    createdAt: NOW,
    memberships: [],
    ...overrides,
  };
}

export function makeJoinRequestRepository(
  initial: JoinRequestRecord[] = []
): {
  repo: IJoinRequestRepository;
  rows: Map<string, JoinRequestRecord>;
  workspaceNames: Map<string, string>;
} {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const workspaceNames = new Map<string, string>();

  function insert(input: {
    workspaceId: string;
    userId: string;
    message: string | null;
  }): JoinRequestRecord {
    const row: JoinRequestRecord = {
      id: `jr-${rows.size + 1}`,
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: 'PENDING',
      message: input.message,
      decidedBy: null,
      decidedAt: null,
      createdAt: NOW,
    };
    rows.set(row.id, row);
    return row;
  }

  const repo: IJoinRequestRepository = {
    async create(input) {
      const existing = [...rows.values()].find(
        (row) =>
          row.workspaceId === input.workspaceId &&
          row.userId === input.userId &&
          row.status === 'PENDING'
      );
      if (existing) return existing;
      const row = insert(input);
      return row;
    },
    async createIfAbsent(input) {
      // Mirrors ON CONFLICT (workspace,user) WHERE status='PENDING'
      // DO NOTHING RETURNING: a live pending row answers `null`.
      const existing = [...rows.values()].find(
        (row) =>
          row.workspaceId === input.workspaceId &&
          row.userId === input.userId &&
          row.status === 'PENDING'
      );
      if (existing) return null;
      return insert(input);
    },
    async findPending(workspaceId, userId) {
      return (
        [...rows.values()].find(
          (row) =>
            row.workspaceId === workspaceId &&
            row.userId === userId &&
            row.status === 'PENDING'
        ) ?? null
      );
    },
    async findById(requestId, workspaceId) {
      const row = rows.get(requestId);
      if (!row || row.workspaceId !== workspaceId) return null;
      return row;
    },
    async listByWorkspace(workspaceId, status: JoinRequestStatus) {
      return [...rows.values()]
        .filter((row) => row.workspaceId === workspaceId && row.status === status)
        .map<JoinRequestWithUser>((row) => ({
          ...row,
          handle: 'member-handle',
          fullName: 'Member',
        }));
    },
    async listByUser(userId) {
      return [...rows.values()]
        .filter((row) => row.userId === userId)
        .map<JoinRequestWithWorkspace>((row) => ({
          ...row,
          workspaceName: workspaceNames.get(row.workspaceId) ?? 'General',
        }));
    },
    async decide(requestId, status, decidedBy) {
      const row = rows.get(requestId);
      if (!row || row.status !== 'PENDING') return null;
      const next: JoinRequestRecord = {
        ...row,
        status,
        decidedBy,
        decidedAt: new Date('2026-10-02T12:00:00.000Z'),
      };
      rows.set(requestId, next);
      return next;
    },
  };

  return { repo, rows, workspaceNames };
}

export function invitationRecord(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    workspaceId: '11111111-1111-4111-8111-111111111111',
    emailHash: 'e'.repeat(64),
    role: 'MEMBER',
    tokenHash: 't'.repeat(64),
    expiresAt: new Date('2026-10-04T12:00:00.000Z'),
    maxUses: 1,
    usedCount: 0,
    status: 'PENDING',
    revokedAt: null,
    createdBy: ADMIN_USER_ID,
    createdAt: NOW,
    ...overrides,
  };
}

export function makeInvitationAdminRepository(
  initial: Invitation[] = []
): {
  repo: IInvitationAdminRepository;
  invitations: Invitation[];
} {
  const invitations = [...initial];

  const repo: IInvitationAdminRepository = {
    async findById(invitationId) {
      return invitations.find((row) => row.id === invitationId) ?? null;
    },
    async listByWorkspace(workspaceId) {
      return invitations.filter((row) => row.workspaceId === workspaceId);
    },
    async revokeById(invitationId) {
      const row = invitations.find((item) => item.id === invitationId);
      if (!row || row.status !== 'PENDING') return false;
      row.status = 'REVOKED';
      row.revokedAt = NOW;
      return true;
    },
    async revokePendingForEmail(workspaceId, emailHash) {
      let count = 0;
      for (const row of invitations) {
        if (
          row.workspaceId === workspaceId &&
          row.emailHash === emailHash &&
          row.status === 'PENDING'
        ) {
          row.status = 'REVOKED';
          row.revokedAt = NOW;
          count += 1;
        }
      }
      return count;
    },
  };

  return { repo, invitations };
}

/** A role lookup whose only ADMIN membership is `adminOf` (null: none). */
export function makeRoleLookup(adminOf: string | null = null): {
  getRole(
    userId: string,
    workspaceId: string,
    tid: string
  ): Promise<WorkspaceRole | null>;
} {
  return {
    async getRole(_userId, workspaceId) {
      return adminOf !== null && workspaceId === adminOf ? 'ADMIN' : null;
    },
  };
}

/**
 * Fake `IWorkspaceJoinCodeRepository` (ADR-0045/0046): an in-memory table of
 * join-code rows. `consume` mirrors the conditional UPDATE of the Drizzle
 * adapter — purpose match, revocation, expiry and the use cap are all
 * checked before the increment (the EVENT class additionally requires
 * `auto_approve`), and a failed match returns `null` without touching the
 * row.
 */
export function makeJoinCodeRepository(
  initial: WorkspaceJoinCodeRecord[] = []
): {
  repo: IWorkspaceJoinCodeRepository;
  rows: Map<string, WorkspaceJoinCodeRecord>;
  creates: CreateWorkspaceJoinCodeInput[];
  consumes: Array<{ codeHash: string; purpose: JoinCodePurpose; ok: boolean }>;
} {
  const rows = new Map(initial.map((row) => [row.id, row]));
  const creates: CreateWorkspaceJoinCodeInput[] = [];
  const consumes: Array<{
    codeHash: string;
    purpose: JoinCodePurpose;
    ok: boolean;
  }> = [];

  const repo: IWorkspaceJoinCodeRepository = {
    async create(input) {
      creates.push(input);
      const row: WorkspaceJoinCodeRecord = {
        id: `code-${rows.size + 1}`,
        workspaceId: input.workspaceId,
        codeHash: input.codeHash,
        purpose: input.purpose ?? 'WORKSPACE',
        label: input.label ?? null,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        usedCount: 0,
        autoApprove: input.autoApprove ?? false,
        revokedAt: null,
        createdByHash: input.createdByHash ?? null,
        createdAt: NOW,
      };
      rows.set(row.id, row);
      return row;
    },
    async list(workspaceId, _tid, _tx, purpose) {
      // Mirrors the adapter's SQL: the optional purpose filter applies.
      return [...rows.values()].filter(
        (row) =>
          row.workspaceId === workspaceId &&
          (purpose === undefined || row.purpose === purpose)
      );
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async consume(codeHash, purpose) {
      const row = [...rows.values()].find((r) => r.codeHash === codeHash);
      const live =
        row !== undefined &&
        row.purpose === purpose &&
        (purpose !== 'EVENT' || row.autoApprove === true) &&
        row.revokedAt === null &&
        (row.expiresAt === null || row.expiresAt > NOW) &&
        (row.maxUses === null || row.usedCount < row.maxUses);
      if (!row || !live) {
        consumes.push({ codeHash, purpose, ok: false });
        return null;
      }
      row.usedCount += 1;
      consumes.push({ codeHash, purpose, ok: true });
      return row;
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      const next = { ...row, ...patch };
      rows.set(id, next);
      return next;
    },
    async revoke(id) {
      const row = rows.get(id);
      if (row) row.revokedAt = NOW;
    },
  };

  return { repo, rows, creates, consumes };
}

/** Factory for a join-code row with sane defaults. */
export function joinCodeRecord(
  overrides: Partial<WorkspaceJoinCodeRecord> = {}
): WorkspaceJoinCodeRecord {
  return {
    id: 'code-1',
    workspaceId: '11111111-1111-4111-8111-111111111111',
    codeHash: 'hash-1',
    purpose: 'WORKSPACE',
    label: 'default',
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    autoApprove: false,
    revokedAt: null,
    createdByHash: 'a'.repeat(64),
    createdAt: NOW,
    ...overrides,
  };
}
