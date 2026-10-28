/**
 * Read model of the tenant administration screens (US-00).
 *
 * It is a read-only port: it lists and searches users, and resolves an email
 * to a user so an admin can add them directly. Membership writes stay in the
 * membership ports.
 */
export interface TenantUserMembershipRecord {
  workspaceId: string;
  workspaceName: string;
  role: string;
  status: string;
}

export interface TenantUserRecord {
  id: string;
  email: string | null;
  fullName: string | null;
  provider: string;
  systemRole: string;
  authorHash: string;
  createdAt: Date;
  memberships: TenantUserMembershipRecord[];
}

export interface ListTenantUsersInput {
  search?: string;
  limit: number;
  /** Opaque keyset cursor returned by a previous page. */
  cursor?: string;
}

export interface ListTenantUsersResult {
  users: TenantUserRecord[];
  nextCursor: string | null;
}

export interface ITenantAdminRepository {
  listUsers(
    input: ListTenantUsersInput,
    tid: string
  ): Promise<ListTenantUsersResult>;

  findUserByEmail(email: string, tid: string): Promise<TenantUserRecord | null>;

  findUserById(userId: string, tid: string): Promise<TenantUserRecord | null>;
}
