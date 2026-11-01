<script lang="ts">
  import { page } from '$app/state';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminMemberDto, AdminWorkspaceDto } from '@vozlab/shared-types';
  import { UpdateWorkspaceSchema } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  const isTenantAdmin = $derived(session.user?.systemRole === 'ADMIN');

  // Break-glass: a tenant admin may target a workspace they do not belong to
  // via ?workspaceId=, without mutating the per-tab selector.
  const targetWorkspaceId = $derived(
    page.url.searchParams.get('workspaceId') || workspace.currentWorkspaceId
  );

  const canAdmin = $derived(
    targetWorkspaceId !== '' &&
      (workspace.isAdmin && targetWorkspaceId === workspace.currentWorkspaceId
        ? true
        : isTenantAdmin)
  );

  // Section navigation.
  let section = $state<'general' | 'members'>('general');

  // General
  let ws = $state<AdminWorkspaceDto | null>(null);
  let loading = $state(false);
  let error = $state<ApiFailure | null>(null);
  let name = $state('');
  let description = $state('');
  let isPublic = $state(true);
  let saving = $state(false);
  let saved = $state(false);

  // Members
  let members = $state<AdminMemberDto[]>([]);
  let membersLoading = $state(false);
  let addHandle = $state('');
  let addRole = $state('MEMBER');
  let adding = $state(false);

  async function loadWorkspace(): Promise<void> {
    if (!canAdmin) return;
    loading = true;
    error = null;
    try {
      const loaded = await admin.getAdminWorkspace(api, workspace.currentWorkspaceId);
      ws = loaded;
      name = loaded.name;
      description = loaded.description ?? '';
      isPublic = loaded.isPublic;
    } catch (e) {
      error = describeFailure(e);
      await redirectToLoginOnAuthFailure(error, workspace, '/workspace-admin');
    } finally {
      loading = false;
    }
  }

  async function loadMembers(): Promise<void> {
    if (!canAdmin) return;
    membersLoading = true;
    try {
      members = await admin.listMembers(api, workspace.currentWorkspaceId);
    } catch (e) {
      error = describeFailure(e);
    } finally {
      membersLoading = false;
    }
  }

  $effect(() => {
    if (canAdmin) {
      loadWorkspace();
      loadMembers();
    }
  });

  // Group members by user, collecting their role union.
  const grouped = $derived.by(() => {
    const acc: Record<string, { userId: string; handle: string | null; fullName: string | null; roles: string[]; status: string }> = {};
    for (const m of members) {
      if (!acc[m.userId]) {
        acc[m.userId] = { userId: m.userId, handle: m.handle, fullName: m.fullName, roles: [], status: m.status };
      }
      acc[m.userId].roles.push(m.role);
      if (m.status !== 'ACTIVE') acc[m.userId].status = m.status;
    }
    return Object.values(acc);
  });

  async function saveGeneral(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!ws) return;
    saving = true;
    saved = false;
    error = null;
    try {
      const parsed = UpdateWorkspaceSchema.parse({ name, description: description || null, isPublic });
      const updated = await admin.updateAdminWorkspace(api, workspace.currentWorkspaceId, parsed);
      ws = updated;
      name = updated.name;
      description = updated.description ?? '';
      isPublic = updated.isPublic;
      saved = true;
    } catch (e) {
      error = describeFailure(e);
    } finally {
      saving = false;
    }
  }

  async function addMemberDirect(): Promise<void> {
    adding = true;
    error = null;
    try {
      await admin.addMember(api, workspace.currentWorkspaceId, addHandle, addRole);
      addHandle = '';
      await loadMembers();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      adding = false;
    }
  }

  async function run(action: () => Promise<void>): Promise<void> {
    error = null;
    try {
      await action();
      await loadMembers();
    } catch (e) {
      error = describeFailure(e);
    }
  }
</script>

<svelte:head>
  <title>{t('workspaceAdmin.title')}</title>
</svelte:head>

{#if !canAdmin}
  <section class="rounded-card bg-brand-100 p-6" role="status">
    <h1>{t('workspaceAdmin.title')}</h1>
    <p class="mt-2 text-body text-muted">{t('workspaceAdmin.noAccess')}</p>
  </section>
{:else}
  <section class="space-y-6">
    <h1>{t('workspaceAdmin.title')}</h1>
    {#if ws}
      <p class="text-small text-muted">{ws.name} · {ws.slug}</p>
    {/if}

    {#if error}
      <p role="alert" class="text-pill-negative-ink">{error.code}: {error.message}</p>
    {/if}

    <nav aria-label={t('workspaceAdmin.general')} class="flex gap-2 border-b border-rule">
      <button type="button" class="px-3 py-2 text-body font-medium {section === 'general' ? 'text-accent border-b-2 border-accent' : 'text-muted'}" onclick={() => (section = 'general')}>
        {t('workspaceAdmin.general')}
      </button>
      <button type="button" class="px-3 py-2 text-body font-medium {section === 'members' ? 'text-accent border-b-2 border-accent' : 'text-muted'}" onclick={() => (section = 'members')}>
        {t('workspaceAdmin.members')}
      </button>
    </nav>

    {#if section === 'general'}
      {#if loading}
        <p>{t('common.loading') ?? 'Loading…'}</p>
      {:else if ws}
        <form class="rounded-card bg-brand-100 p-4 space-y-3 max-w-measure" onsubmit={saveGeneral}>
          <h2>{t('workspaceAdmin.general')}</h2>
          <label class="flex flex-col gap-1">
            <span class="text-small text-muted">{t('admin.name')}</span>
            <input class="field w-full" bind:value={name} required minlength="2" maxlength="255" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-small text-muted">{t('admin.description')}</span>
            <input class="field w-full" bind:value={description} maxlength="500" />
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={isPublic} />
            {t('admin.isPublic')}
          </label>
          <div class="flex items-center gap-2">
            <button type="submit" class="btn btn-primary" disabled={saving}>
              {t('workspaceAdmin.save')}
            </button>
            {#if saved}
              <span class="text-small text-muted">{t('workspaceAdmin.saved')}</span>
            {/if}
          </div>
        </form>
      {:else}
        <p class="text-muted">{t('workspaceAdmin.loadFailed')}</p>
      {/if}
    {:else if section === 'members'}
      <div class="rounded-card bg-brand-100 p-4 space-y-3">
        <h2>{t('admin.members')}</h2>

        <div class="space-y-2 border-b border-rule pb-3">
          <h3 class="text-small font-medium">{t('admin.addMember') ?? 'Add member directly'}</h3>
          <div class="flex flex-wrap items-center gap-2">
            <input class="field" bind:value={addHandle} placeholder={t('admin.handle') ?? 'Handle'} />
            <select class="field" bind:value={addRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button type="button" class="btn btn-primary text-small" disabled={adding} onclick={addMemberDirect}>
              {t('admin.addMember') ?? 'Add'}
            </button>
          </div>
        </div>

        {#if membersLoading}
          <p>{t('common.loading') ?? 'Loading…'}</p>
        {:else if grouped.length === 0}
          <p>{t('admin.noWorkspaces') ?? 'No members.'}</p>
        {:else}
          <ul class="space-y-2">
            {#each grouped as g (g.userId)}
              <li class="flex flex-col gap-1 border-b border-rule py-2">
                <div class="flex items-center justify-between gap-2">
                  <span>{g.fullName ?? g.handle ?? g.userId} ({g.status})</span>
                  <span class="flex gap-1">
                    {#if g.status === 'ACTIVE'}
                      <button class="btn btn-quiet text-small" onclick={() => run(() => admin.suspendMember(api, workspace.currentWorkspaceId, g.userId))}>
                        {t('admin.suspend')}
                      </button>
                    {:else if g.status === 'SUSPENDED'}
                      <button class="btn btn-quiet text-small" onclick={() => run(() => admin.reactivateMember(api, workspace.currentWorkspaceId, g.userId))}>
                        {t('admin.reactivate')}
                      </button>
                    {/if}
                    <button class="btn btn-quiet text-small" onclick={() => run(() => admin.removeMember(api, workspace.currentWorkspaceId, g.userId))}>
                      {t('admin.remove')}
                    </button>
                  </span>
                </div>
                <div class="flex flex-wrap gap-1 items-center">
                  {#each g.roles as r (r)}
                    <span class="text-small px-2 py-0.5 rounded bg-surface-2">
                      {r}
                      <button class="ml-1 text-small" onclick={() => run(() => admin.removeMemberRole(api, workspace.currentWorkspaceId, g.userId, r))}>×</button>
                    </span>
                  {/each}
                  <select class="field text-small" onchange={async (e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    if (v) await run(() => admin.assignMemberRole(api, workspace.currentWorkspaceId, g.userId, v));
                    (e.target as HTMLSelectElement).value = '';
                  }}>
                    <option value="">{t('admin.addRole') ?? 'Add role…'}</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="MODERATOR">MODERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>
{/if}
