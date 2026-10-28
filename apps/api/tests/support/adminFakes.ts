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
    autoApproveJoinCode: false,
    joinCode: 'JOINCODE00000001',
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
    email: 'member@example.edu',
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
        autoApproveJoinCode: input.autoApproveJoinCode ?? false,
        joinCode: input.joinCode,
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
    async findByJoinCode(joinCode: string) {
      return [...rows.values()].find((row) => row.joinCode === joinCode) ?? null;
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
        email: current?.email ?? null,
        fullName: current?.fullName ?? null,
        role: input.role,
        status: 'ACTIVE',
        joinedAt: current?.joinedAt ?? NOW,
        tx,
      });
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
          user.email?.toLowerCase().includes(search) ||
          user.fullName?.toLowerCase().includes(search)
        );
      });
      return { users: filtered.slice(0, input.limit), nextCursor: null };
    },
    async findUserByEmail(email) {
      return (
        users.find(
          (user) => user.email?.toLowerCase() === email.toLowerCase()
        ) ?? null
      );
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
    email: 'member@example.edu',
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

  const repo: IJoinRequestRepository = {
    async create(input) {
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
          email: 'member@example.edu',
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
    email: 'invitee@example.edu',
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
    async revokePendingForEmail(workspaceId, email) {
      let count = 0;
      for (const row of invitations) {
        if (
          row.workspaceId === workspaceId &&
          row.email?.toLowerCase() === email.toLowerCase() &&
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
