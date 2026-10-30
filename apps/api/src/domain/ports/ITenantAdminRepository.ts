/**
 * Read model of the tenant administration screens (US-00).
 *
 * It is a read-only port: it lists and searches users so an admin can find
 * them. Membership writes stay in the membership ports. DEC-4/DEC-5 D5: the
 * tenant stores no email, so the record and the search ride on `handle` and
 * `full_name` only.
 */
export interface TenantUserMembershipRecord {
  workspaceId: string;
  workspaceName: string;
  role: string;
  status: string;
}

export interface TenantUserRecord {
  id: string;
  handle: string | null;
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

  findUserById(userId: string, tid: string): Promise<TenantUserRecord | null>;
}
