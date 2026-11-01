<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminWorkspaceDto } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  /** Tenant administrators reach this surface. */
  const canAdmin = $derived(session.user?.systemRole === 'ADMIN');

  let workspaces = $state<AdminWorkspaceDto[]>([]);
  let loading = $state(false);
  let error = $state<ApiFailure | null>(null);

  // create workspace form
  let newName = $state('');
  let newSlug = $state('');
  let newDesc = $state('');
  let newPublic = $state(true);
  let newKind = $state('PRIVATE');
  let newInitialAdmin = $state('');
  let tenantUsers = $state<Array<{ id: string; handle: string | null; fullName: string | null; systemRole: string }>>([]);
  let creating = $state(false);
  // v6/TASK-09 (B7): the tenant hygiene sweep.
  let cleanupDays = $state('30');
  let runningCleanup = $state(false);
  let cleanupResult = $state<string | null>(null);

  async function loadWorkspaces() {
    loading = true; error = null;
    try {
      workspaces = await admin.listAdminWorkspaces(api);
      try {
        const users = await admin.listAdminUsers(api);
        tenantUsers = users.map((u) => ({ id: u.id, handle: u.handle, fullName: u.fullName, systemRole: u.systemRole }));
      } catch (e) {
        // tenant user directory is best-effort on the create form
      }
    } catch (e) {
      error = describeFailure(e);
      await redirectToLoginOnAuthFailure(error, workspace, '/admin');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (canAdmin) loadWorkspaces();
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

  <div class="grid gap-6 lg:grid-cols-2">
    <div class="rounded-card bg-brand-100 p-4 space-y-3">
      <h2>{t('admin.workspaces')}</h2>
      {#if loading}
        <p>{t('common.loading') ?? 'Loading…'}</p>
      {:else if workspaces.length === 0}
        <p>{t('admin.noWorkspaces')}</p>
      {:else}
        <ul class="space-y-1">
          {#each workspaces as w (w.id)}
            <li class="flex items-center justify-between gap-2">
              <span class="flex-1">
                {w.name} <span class="text-muted text-small">({w.slug})</span>
                <span class="text-small text-accent">{w.kind}</span>
                <span class="text-small text-muted">· {w.memberCount} members · {w.pendingRequestCount} pending</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}

      <form class="space-y-2 border-t border-rule pt-3" onsubmit={(e) => { e.preventDefault(); createWorkspace(); }}>
        <h3>{t('admin.createWorkspace')}</h3>
        <input class="field w-full" bind:value={newName} placeholder={t('admin.name')} />
        <input class="field w-full" bind:value={newSlug} placeholder={t('admin.slug')} />
        <input class="field w-full" bind:value={newDesc} placeholder={t('admin.description')} />
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={newPublic} />
          {t('admin.isPublic')}
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-small text-muted">{t('admin.kind') ?? 'Kind'}</span>
          <select class="field w-full" bind:value={newKind}>
            <option value="PRIVATE">PRIVATE</option>
            <option value="PUBLIC">PUBLIC</option>
            <option value="EVENT">EVENT</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-small text-muted">{t('admin.initialAdmin') ?? 'Initial admin (optional)'}</span>
          <select class="field w-full" bind:value={newInitialAdmin}>
            <option value="">{t('admin.creatorBecomesAdmin') ?? 'Creator becomes admin'}</option>
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

    <div class="rounded-card bg-brand-100 p-4 space-y-3">
      <div class="space-y-2">
        <h3>{t('admin.cleanup') ?? 'Tenant hygiene'}</h3>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1 text-small">
            {t('admin.cleanupDays') ?? 'Guest inactivity window (days)'}
            <input class="field w-20" type="number" min="1" max="3650" bind:value={cleanupDays} />
          </label>
          <button type="button" class="btn btn-primary text-small" disabled={runningCleanup} onclick={runTenantCleanup}>
            {t('admin.runCleanup') ?? 'Run cleanup'}
          </button>
        </div>
        {#if cleanupResult}
          <p class="text-small text-muted">{cleanupResult}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="rounded-card bg-brand-100 p-4 space-y-2">
    <h2>{t('admin.tenantUsers')}</h2>
    {#if tenantUsers.length === 0}
      <p class="text-small text-muted">{t('admin.noWorkspaces')}</p>
    {:else}
      <ul class="space-y-1">
        {#each tenantUsers as u (u.id)}
          <li class="text-small flex items-center justify-between gap-2">
            <span>{u.fullName ?? u.handle ?? u.id}</span>
            <span class="text-muted">{u.systemRole}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
{/if}