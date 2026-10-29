import { describe, expect, it } from 'vitest';
import { SelectTenantUseCase } from '../../src/application/use_cases/SelectTenantUseCase.js';
import { makeAuditLog, makeGlobalUserRepository, makeRefreshTokenRepository } from '../support/authFakes.js';
import { TENANT_ID, TENANT_KEY, TENANT_SLUG, USER_ID } from '../support/authFakes.js';

const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT_KEY = 'other-oidc';
const OTHER_TENANT_SLUG = 'otro';
const GLOBAL_ID = 'global-id-1';

function makeRouterDb(tenants: Array<{ id: string; slug: string; oidcTenantId: string; status: string }>) {
  const routerDb = {
    async findTenantsByGlobalUser(_globalUserId: string) {
      return tenants;
    },
    async findTenantById(tenantId: string) {
      return tenants.find((t) => t.id === tenantId) ?? null;
    },
  } as any;
  return { routerDb };
}

function buildUseCase(
  linked: Array<{ id: string; slug: string; oidcTenantId: string; status: string }>,
  findByIdOverride: ((id: string) => Promise<any>) | null = null
) {
  const globalIdentity = makeGlobalUserRepository();
  if (findByIdOverride) {
    (globalIdentity.repo as any).findById = findByIdOverride;
  }
  const refresh = makeRefreshTokenRepository();
  const router = makeRouterDb(linked);
  const userRepo = {
    async findOrCreateByExternalIdentity() {
      return { id: USER_ID } as any;
    },
  } as any;
  return new SelectTenantUseCase(
    globalIdentity.repo,
    router.routerDb,
    userRepo,
    { runInTransaction: async (_tid: string, cb: any) => cb({}) } as any,
    refresh.refreshRepo
  );
}

describe('SelectTenantUseCase (switch-tenant / select-tenant)', () => {
  const linked = [
    { id: TENANT_ID, slug: TENANT_SLUG, oidcTenantId: TENANT_KEY, status: 'ACTIVE' },
    { id: OTHER_TENANT_ID, slug: OTHER_TENANT_SLUG, oidcTenantId: OTHER_TENANT_KEY, status: 'ACTIVE' },
  ];

  it('cambia a un tenant vinculado y ACTIVE emitiendo refresh token', async () => {
    const useCase = buildUseCase(linked);
    const refresh = makeRefreshTokenRepository();
    // Rebuild wiring so refresh captures creates
    const globalIdentity = makeGlobalUserRepository();
    const router = makeRouterDb(linked);
    const userRepo = {
      async findOrCreateByExternalIdentity() {
        return { id: USER_ID } as any;
      },
    } as any;
    const uc = new SelectTenantUseCase(
      globalIdentity.repo,
      router.routerDb,
      userRepo,
      { runInTransaction: async (_tid: string, cb: any) => cb({}) } as any,
      refresh.refreshRepo
    );

    const result = await uc.execute({
      globalIdentityId: GLOBAL_ID,
      tenantId: OTHER_TENANT_ID,
      refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    });

    expect(refresh.creates).toHaveLength(1);
    const [{ tid, input }] = refresh.creates;
    expect(tid).toBe(OTHER_TENANT_ID);
    expect(input.userId).toBe(USER_ID);
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshExpiresAt instanceof Date).toBe(true);
  });

  it('rechaza un tenant que no está vinculado a la identidad global', async () => {
    const single = [
      { id: TENANT_ID, slug: TENANT_SLUG, oidcTenantId: TENANT_KEY, status: 'ACTIVE' },
    ];
    const useCase = buildUseCase(single);

    await expect(
      useCase.execute({
        globalIdentityId: GLOBAL_ID,
        tenantId: OTHER_TENANT_ID,
        refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
      })
    ).rejects.toMatchObject({ code: 'ERR_TENANT_NOT_PROVISIONED' });
  });

  it('rechaza una identidad global inexistente', async () => {
    const useCase = buildUseCase(linked, async () => null);

    await expect(
      useCase.execute({
        globalIdentityId: 'missing-global',
        tenantId: TENANT_ID,
        refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
      })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
  });

  it('registra TENANT_SELECTED en la trail de la identidad global (B12)', async () => {
    const globalIdentity = makeGlobalUserRepository();
    const router = makeRouterDb(linked);
    const refresh = makeRefreshTokenRepository();
    const { audit, events } = makeAuditLog();
    const userRepo = {
      async findOrCreateByExternalIdentity() {
        return { id: USER_ID } as any;
      },
    } as any;
    const uc = new SelectTenantUseCase(
      globalIdentity.repo,
      router.routerDb,
      userRepo,
      { runInTransaction: async (_tid: string, cb: any) => cb({}) } as any,
      refresh.refreshRepo,
      audit
    );

    await uc.execute({
      globalIdentityId: GLOBAL_ID,
      tenantId: OTHER_TENANT_ID,
      refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'TENANT_SELECTED',
      actorId: USER_ID,
      actorType: 'USER',
      targetType: 'global_identity',
      targetId: GLOBAL_ID,
      tenantId: OTHER_TENANT_ID,
      globalIdentityId: GLOBAL_ID,
    });
    expect(events[0]?.metadata).toMatchObject({ tenantSlug: OTHER_TENANT_SLUG });
  });
});
