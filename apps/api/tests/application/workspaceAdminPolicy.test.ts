import { describe, expect, it } from 'vitest';
import {
  assertTenantAdmin,
  assertWorkspaceAdmin,
} from '../../src/application/policies/workspaceAdminPolicy.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { makeRoleLookup } from '../support/adminFakes.js';

const tenantAdmin = { async findById() { return { ...AUTH_USER, systemRole: 'ADMIN' }; } };
const regularUser = { async findById() { return AUTH_USER; } };
const missingUser = { async findById() { return null; } };

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected the call to be rejected');
}

describe('workspaceAdminPolicy', () => {
  it('lets a tenant ADMIN through without any membership', async () => {
    await expect(
      assertTenantAdmin(USER_ID, TENANT_ID, tenantAdmin)
    ).resolves.toBeUndefined();

    await expect(
      assertWorkspaceAdmin(
        USER_ID,
        WORKSPACE_ID,
        TENANT_ID,
        tenantAdmin,
        makeRoleLookup(null)
      )
    ).resolves.toEqual({ isTenantAdmin: true });
  });

  it('rejects a regular user from tenant administration', async () => {
    await expect(
      rejectionOf(assertTenantAdmin(USER_ID, TENANT_ID, regularUser))
    ).resolves.toBe('ERR_AUTHORIZATION_FAILED');
  });

  it('accepts a workspace ADMIN of the target workspace only', async () => {
    await expect(
      assertWorkspaceAdmin(
        USER_ID,
        WORKSPACE_ID,
        TENANT_ID,
        regularUser,
        makeRoleLookup(WORKSPACE_ID)
      )
    ).resolves.toEqual({ isTenantAdmin: false });

    await expect(
      rejectionOf(
        assertWorkspaceAdmin(
          USER_ID,
          '99999999-9999-4999-8999-999999999999',
          TENANT_ID,
          regularUser,
          makeRoleLookup(WORKSPACE_ID)
        )
      )
    ).resolves.toBe('ERR_AUTHORIZATION_FAILED');
  });

  it('treats an unknown actor as an invalid token, not as a permission problem', async () => {
    await expect(
      rejectionOf(assertTenantAdmin(USER_ID, TENANT_ID, missingUser))
    ).resolves.toBe('ERR_INVALID_TOKEN');
  });
});
