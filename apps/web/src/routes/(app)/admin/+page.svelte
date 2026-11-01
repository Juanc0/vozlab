<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminUserDto, AdminWorkspaceDto, SystemRole } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  /** Tenant administrators reach this surface. */
  const canAdmin = $derived(session.user?.systemRole === 'ADMIN');

  type AdminTab = 'workspaces' | 'users' | 'hygiene';

  const TABS: readonly { readonly id: AdminTab; readonly label: string }[] = [
    { id: 'workspaces', label: t('admin.tabs.workspaces') },
    { id: 'users', label: t('admin.tabs.users') },
    { id: 'hygiene', label: t('admin.tabs.hygiene') }
  ];

  let activeTab = $state<AdminTab>('workspaces');

  let workspaces = $state<AdminWorkspaceDto[]>([]);
  let workspacesLoading = $state(false);

  let tenantUsers = $state<AdminUserDto[]>([]);
  let usersLoading = $state(false);

  let error = $state<ApiFailure | null>(null);

  // create workspace form
  let newName = $state('');
  let newSlug = $state('');
  let newDesc = $state('');
  let newPublic = $state(true);
  let newKind = $state('PRIVATE');
  let newInitialAdmin = $state('');
  let creating = $state(false);

  // v6/TASK-09 (B7): the tenant hygiene sweep.
  let cleanupDays = $state('30');
  let runningCleanup = $state(false);
  let cleanupResult = $state<string | null>(null);

  // expanded memberships per user
  let expanded = $state<Set<string>>(new Set());

  function uid(): string {
    return 'admin';
  }
  const panelId = `admin-panel`;

  function tabId(tab: AdminTab): string {
    return `admin-tab-${tab}`;
  }

  async function loadWorkspaces() {
    workspacesLoading = true;
    try {
      workspaces = await admin.listAdminWorkspaces(api);
    } catch (e) {
      error = describeFailure(e);
      await redirectToLoginOnAuthFailure(error, workspace, '/admin');
    } finally {
      workspacesLoading = false;
    }
  }

  async function loadUsers() {
    usersLoading = true;
    try {
      tenantUsers = await admin.listAdminUsers(api);
    } catch (e) {
      error = describeFailure(e);
      await redirectToLoginOnAuthFailure(error, workspace, '/admin');
    } finally {
      usersLoading = false;
    }
  }

  onMount(() => {
    if (canAdmin) {
      void loadWorkspaces();
      void loadUsers();
    }
  });

  async function createWorkspace() {
    creating = true; error = null;
    try {
      const { joinCode: _joinCode, ...ws } = await admin.createAdminWorkspace(api, {
        name: newName,
        slug: newSlug,
        description: newDesc || null,
        isPublic: newPublic,
        kind: newKind as 'PRIVATE' | 'PUBLIC' | 'EVENT',
        initialAdminUserId: newInitialAdmin || undefined
      });
      workspaces = [...workspaces, ws];
      newName = ''; newSlug = ''; newDesc = '';
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creating = false;
    }
  }

  async function runTenantCleanup() {
    runningCleanup = true;
    cleanupResult = null;
    try {
      const daysText = String(cleanupDays ?? '').trim();
      const days = daysText === '' ? undefined : Number(daysText);
      const res = await admin.runCleanup(api, days);
      cleanupResult = t('admin.cleanupResult', {
        invitations: res.expiredInvitations,
        guests: res.removedGuests
      });
    } catch (e) {
      error = describeFailure(e);
    } finally {
      runningCleanup = false;
    }
  }

  function toggleExpanded(userId: string) {
    const next = new Set(expanded);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    expanded = next;
  }

  async function changeSystemRole(userId: string, systemRole: SystemRole) {
    error = null;
    try {
      const res = await admin.updateTenantUserSystemRole(api, userId, systemRole);
      tenantUsers = tenantUsers.map((u) =>
        u.id === userId ? { ...u, systemRole: res.systemRole } : u
      );
    } catch (e) {
      error = describeFailure(e);
    }
  }

  async function suspendUser(userId: string) {
    error = null;
    try {
      await admin.suspendTenantUser(api, userId);
    } catch (e) {
      error = describeFailure(e);
    }
  }

  async function activateUser(userId: string) {
    error = null;
    try {
      await admin.activateTenantUser(api, userId);
    } catch (e) {
      error = describeFailure(e);
    }
  }

  function selectTab(tab: AdminTab): void {
    activeTab = tab;
  }

  function onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = TABS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    const tab = TABS[next];
    if (!tab) return;
    event.preventDefault();
    activeTab = tab.id;
    document.getElementById(tabId(tab.id))?.focus();
  }
</script>

<svelte:head>
  <title>{t('admin.title')}</title>
</svelte:head>

{#if !canAdmin}
  <section class="rounded-card bg-brand-100 p-6" role="status">
    <h1>{t('admin.title')}</h1>
    <p class="mt-2 text-body text-muted">{t('admin.noAccess')}</p>
  </section>
{:else}
  <section class="space-y-6">
    <h1>{t('admin.title')}</h1>

    {#if error}
      <p role="alert" class="text-pill-negative-ink">{error.message}</p>
    {/if}

    <div role="tablist" aria-label={t('admin.title')} class="flex gap-4 border-b border-rule">
      {#each TABS as tab, index (tab.id)}
        <button
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={activeTab === tab.id}
          aria-controls={panelId}
          tabindex={activeTab === tab.id ? 0 : -1}
          class="-mb-px border-b-2 border-transparent pb-2 text-body font-medium text-muted hover:text-text aria-[selected=true]:border-accent aria-[selected=true]:text-text"
          onclick={() => selectTab(tab.id)}
          onkeydown={(event) => onTabKeydown(event, index)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div role="tabpanel" id={panelId} aria-labelledby={tabId(activeTab)} tabindex="0" class="mt-3 space-y-4">
      {#if activeTab === 'workspaces'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h2>{t('admin.workspaces')}</h2>
          {#if workspacesLoading}
            <p>{t('common.loading')}</p>
          {:else if workspaces.length === 0}
            <p>{t('admin.noWorkspaces')}</p>
          {:else}
            <ul class="space-y-1">
              {#each workspaces as w (w.id)}
                <li class="text-small flex items-center justify-between gap-2">
                  <span class="flex-1">
                    {w.name} <span class="text-muted">({w.slug})</span>
                    <span class="text-accent">{w.kind}</span>
                    <span class="text-muted">· {w.memberCount} {t('admin.members')} · {w.pendingRequestCount} {t('admin.joinRequests')}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h2>{t('admin.createWorkspace')}</h2>
          <form class="space-y-2" onsubmit={(e) => { e.preventDefault(); createWorkspace(); }}>
            <input class="field w-full" bind:value={newName} placeholder={t('admin.name')} />
            <input class="field w-full" bind:value={newSlug} placeholder={t('admin.slug')} />
            <input class="field w-full" bind:value={newDesc} placeholder={t('admin.description')} />
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={newPublic} />
              {t('admin.isPublic')}
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-small text-muted">{t('admin.kind')}</span>
              <select class="field w-full" bind:value={newKind}>
                <option value="PRIVATE">PRIVATE</option>
                <option value="PUBLIC">PUBLIC</option>
                <option value="EVENT">EVENT</option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-small text-muted">{t('admin.initialAdmin')}</span>
              <select class="field w-full" bind:value={newInitialAdmin}>
                <option value="">{t('admin.creatorBecomesAdmin')}</option>
                {#each tenantUsers as u (u.id)}
                  <option value={u.id}>{u.fullName ?? u.handle ?? u.id}</option>
                {/each}
              </select>
            </label>
            <button type="submit" class="btn btn-primary" disabled={creating}>
              {t('admin.createWorkspace')}
            </button>
          </form>
        </div>
      {:else if activeTab === 'users'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h2>{t('admin.tenantUsers')}</h2>
          {#if usersLoading}
            <p>{t('common.loading')}</p>
          {:else if tenantUsers.length === 0}
            <p>{t('admin.noWorkspaces')}</p>
          {:else}
            <ul class="space-y-2">
              {#each tenantUsers as u (u.id)}
                <li class="text-small flex flex-col gap-2 border-b border-rule pb-2">
                  <div class="flex items-center justify-between gap-2">
                    <span>{u.fullName ?? u.handle ?? u.id}</span>
                    <div class="flex items-center gap-2">
                      <label class="flex items-center gap-1">
                        <span class="sr-only">{t('admin.systemRole')}</span>
                        <select
                          class="field"
                          value={u.systemRole}
                          onchange={(e) => changeSystemRole(u.id, (e.currentTarget as HTMLSelectElement).value as SystemRole)}
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="MODERATOR">MODERATOR</option>
                          <option value="SYSTEM_AGENT">SYSTEM_AGENT</option>
                        </select>
                      </label>
                      <button type="button" class="btn btn-primary text-small" onclick={() => suspendUser(u.id)}>
                        {t('admin.suspend')}
                      </button>
                      <button type="button" class="btn btn-primary text-small" onclick={() => activateUser(u.id)}>
                        {t('admin.activate')}
                      </button>
                      <button type="button" class="btn-quiet text-small" onclick={() => toggleExpanded(u.id)}>
                        {t('admin.memberships')}
                      </button>
                    </div>
                  </div>
                  {#if expanded.has(u.id)}
                    <div class="pl-4">
                      {#if u.memberships.length === 0}
                        <p class="text-muted">{t('admin.noMemberships')}</p>
                      {:else}
                        <ul class="space-y-1">
                          {#each u.memberships as m (m.workspaceId)}
                            <li class="text-muted">{m.workspaceName} · {m.role} · {m.status}</li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h3>{t('admin.cleanup')}</h3>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1 text-small">
              {t('admin.cleanupDays')}
              <input class="field w-20" type="number" min="1" max="3650" bind:value={cleanupDays} />
            </label>
            <button type="button" class="btn btn-primary text-small" disabled={runningCleanup} onclick={runTenantCleanup}>
              {t('admin.runCleanup')}
            </button>
          </div>
          {#if cleanupResult}
            <p class="text-small text-muted">{cleanupResult}</p>
          {/if}
        </div>
      {/if}
    </div>
  </section>
{/if}