import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { tenantAdminGuard } from '../../src/infrastructure/http/middlewares/TenantAdminGuard.js';
import { workspaceAdminGuard } from '../../src/infrastructure/http/middlewares/WorkspaceAdminGuard.js';
import { AUTH_USER, TENANT_ID, USER_ID, WORKSPACE_ID } from '../support/authFakes.js';
import { makeRoleLookup } from '../support/adminFakes.js';

interface Sent {
  status?: number;
  code?: string;
}

function reply(): { reply: FastifyReply; sent: Sent } {
  const sent: Sent = {};
  const fake = {
    status(code: number) {
      sent.status = code;
      return fake;
    },
    send(payload: { code?: string }) {
      sent.code = payload.code;
      return fake;
    },
  } as unknown as FastifyReply;
  return { reply: fake, sent };
}

function request(overrides: {
  systemRole?: string;
  header?: string;
  params?: Record<string, string>;
}): FastifyRequest {
  return {
    headers: overrides.header ? { 'x-workspace-id': overrides.header } : {},
    params: overrides.params ?? {},
    tid: TENANT_ID,
    user: { userId: USER_ID, authorHash: AUTH_USER.authorHash },
  } as unknown as FastifyRequest;
}

const tenantAdminUser = {
  async findById() {
    return { ...AUTH_USER, systemRole: 'ADMIN' };
  },
};
const regularUser = {
  async findById() {
    return AUTH_USER;
  },
};

describe('tenantAdminGuard', () => {
  it('lets a tenant ADMIN through', async () => {
    const { reply: fake, sent } = reply();
    await tenantAdminGuard({ userRepo: tenantAdminUser as never })(request({}), fake);

    expect(sent).toEqual({});
  });

  it('rejects a regular user with a generic authorization error', async () => {
    const { reply: fake, sent } = reply();
    await tenantAdminGuard({ userRepo: regularUser as never })(request({}), fake);

    expect(sent.code).toBe('ERR_AUTHORIZATION_FAILED');
    expect(sent.status).toBe(403);
  });
});

describe('workspaceAdminGuard', () => {
  const guard = workspaceAdminGuard({
    userRepo: regularUser as never,
    membershipRepo: makeRoleLookup(WORKSPACE_ID) as never,
  });

  it('requires the workspace header', async () => {
    const { reply: fake, sent } = reply();
    await guard(request({}), fake);

    expect(sent.code).toBe('ERR_MISSING_WORKSPACE_HEADER');
  });

  it('rejects a malformed workspace header', async () => {
    const { reply: fake, sent } = reply();
    await guard(request({ header: 'not-a-uuid' }), fake);

    expect(sent.code).toBe('ERR_INVALID_WORKSPACE_HEADER');
  });

  it('answers 404 when a workspace ADMIN targets another workspace', async () => {
    const { reply: fake, sent } = reply();
    await guard(
      request({
        header: WORKSPACE_ID,
        params: { workspaceId: '99999999-9999-4999-8999-999999999999' },
      }),
      fake
    );

    expect(sent.code).toBe('ERR_WORKSPACE_NOT_FOUND');
    expect(sent.status).toBe(404);
  });

  it('lets a workspace ADMIN act on its own workspace and attaches the header', async () => {
    const { reply: fake, sent } = reply();
    const req = request({ header: WORKSPACE_ID, params: { workspaceId: WORKSPACE_ID } });
    await guard(req, fake);

    expect(sent).toEqual({});
    expect(req.workspaceId).toBe(WORKSPACE_ID);
  });

  it('lets a tenant ADMIN target a workspace where they hold no membership', async () => {
    const tenantGuard = workspaceAdminGuard({
      userRepo: tenantAdminUser as never,
      membershipRepo: makeRoleLookup(null) as never,
    });
    const { reply: fake, sent } = reply();
    const target = '99999999-9999-4999-8999-999999999999';
    const req = request({ header: WORKSPACE_ID, params: { workspaceId: target } });

    await tenantGuard(req, fake);

    expect(sent).toEqual({});
    expect(req.workspaceId).toBe(WORKSPACE_ID);
  });
});
