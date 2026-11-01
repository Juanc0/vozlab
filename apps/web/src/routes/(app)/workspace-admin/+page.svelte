<script lang="ts">
  import { page } from '$app/state';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminMemberDto, AdminWorkspaceDto, JoinRequestDto } from '@vozlab/shared-types';
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
  let section = $state<'general' | 'members' | 'access' | 'codes'>('general');

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

  // Access
  let joinRequests = $state<JoinRequestDto[]>([]);
  let accessLoading = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state('MEMBER');
  let creatingInvite = $state(false);
  let createdInviteLink = $state<string | null>(null);
  let invitations = $state<unknown[]>([]);

  // Codes
  let codes = $state<Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null }>>([]);
  let codesLoading = $state(false);
  let newCodeLabel = $state('');
  let creatingCode = $state(false);
  let createdCode = $state<string | null>(null);
  let editingCodeId = $state<string | null>(null);
  let editLabel = $state('');
  let editMaxUses = $state('');
  let editExpiresAt = $state('');
  let editAutoApprove = $state(false);
  let savingCode = $state(false);

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

  async function loadAccess(): Promise<void> {
    if (!canAdmin) return;
    accessLoading = true;
    try {
      joinRequests = await admin.listJoinRequests(api, workspace.currentWorkspaceId);
      invitations = await admin.listInvitations(api, workspace.currentWorkspaceId);
    } catch (e) {
      error = describeFailure(e);
    } finally {
      accessLoading = false;
    }
  }

  async function createInvite(): Promise<void> {
    creatingInvite = true;
    error = null;
    try {
      const res = await admin.createInvitation(api, workspace.currentWorkspaceId, {
        email: inviteEmail,
        role: inviteRole as 'MEMBER' | 'MODERATOR' | 'ADMIN',
      });
      createdInviteLink = res.url;
      inviteEmail = '';
      await loadAccess();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingInvite = false;
    }
  }

  async function approveRequest(id: string): Promise<void> {
    await run(() => admin.approveJoinRequest(api, workspace.currentWorkspaceId, id));
    await loadAccess();
  }

  async function rejectRequest(id: string): Promise<void> {
    await run(() => admin.rejectJoinRequest(api, workspace.currentWorkspaceId, id));
    await loadAccess();
  }

  async function loadCodes(): Promise<void> {
    if (!canAdmin) return;
    codesLoading = true;
    try {
      codes = await admin.listJoinCodes(api, workspace.currentWorkspaceId);
    } catch (e) {
      error = describeFailure(e);
    } finally {
      codesLoading = false;
    }
  }

  async function createCode(): Promise<void> {
    creatingCode = true;
    error = null;
    try {
      const res = await admin.createJoinCode(api, workspace.currentWorkspaceId, { label: newCodeLabel || null, autoApprove: false });
      createdCode = res.code;
      newCodeLabel = '';
      await loadCodes();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingCode = false;
    }
  }

  function startEditCode(c: (typeof codes)[number]): void {
    editingCodeId = c.id;
    editLabel = c.label ?? '';
    editMaxUses = c.maxUses === null ? '' : String(c.maxUses);
    editExpiresAt = c.expiresAt ? c.expiresAt.slice(0, 10) : '';
    editAutoApprove = c.autoApprove;
  }

  async function saveEditCode(): Promise<void> {
    if (!editingCodeId) return;
    savingCode = true;
    try {
      await admin.updateJoinCode(api, workspace.currentWorkspaceId, editingCodeId, {
        label: editLabel || null,
        expiresAt: editExpiresAt ? new Date(`${editExpiresAt}T23:59:59`).toISOString() : null,
        maxUses: editMaxUses === '' ? null : Number(editMaxUses),
        autoApprove: editAutoApprove
      });
      editingCodeId = null;
      await loadCodes();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      savingCode = false;
    }
  }

  $effect(() => {
    if (canAdmin) {
      loadWorkspace();
      loadMembers();
      loadAccess();
      loadCodes();
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
      <button type="button" class="px-3 py-2 text-body font-medium {section === 'access' ? 'text-accent border-b-2 border-accent' : 'text-muted'}" onclick={() => (section = 'access')}>
        {t('workspaceAdmin.access')}
      </button>
      <button type="button" class="px-3 py-2 text-body font-medium {section === 'codes' ? 'text-accent border-b-2 border-accent' : 'text-muted'}" onclick={() => (section = 'codes')}>
        {t('workspaceAdmin.codes')}
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
    {:else if section === 'access'}
      <div class="rounded-card bg-brand-100 p-4 space-y-3">
        <h2>{t('admin.joinRequests') ?? 'Join requests'}</h2>
        {#if accessLoading}
          <p>{t('common.loading') ?? 'Loading…'}</p>
        {:else}
          <ul class="space-y-1">
            {#each joinRequests as r (r.id)}
              <li class="flex items-center justify-between gap-2">
                <span>{r.userId} — {r.status}</span>
                <span class="flex gap-1">
                  <button class="btn btn-quiet text-small" onclick={() => approveRequest(r.id)}>{t('admin.approve') ?? 'Approve'}</button>
                  <button class="btn btn-quiet text-small" onclick={() => rejectRequest(r.id)}>{t('admin.reject') ?? 'Reject'}</button>
                </span>
              </li>
            {/each}
          </ul>

          <h3 class="border-t border-rule pt-3">{t('admin.invitations') ?? 'Invitations'}</h3>
          <div class="flex flex-wrap items-center gap-2">
            <input class="field" bind:value={inviteEmail} placeholder={t('admin.email') ?? 'Email'} />
            <select class="field" bind:value={inviteRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button type="button" class="btn btn-primary text-small" disabled={creatingInvite} onclick={createInvite}>
              {t('admin.createInvitation') ?? 'Create invitation'}
            </button>
          </div>
          {#if createdInviteLink}
            <p class="text-small">{t('admin.invitationLink') ?? 'Invitation link'}: <code class="break-all">{createdInviteLink}</code></p>
          {/if}

          <ul class="space-y-1">
            {#each invitations as inv ( (inv as { id: string }).id )}
              <li class="text-small flex items-center justify-between gap-2">
                <span>{(inv as { status?: string }).status ?? ''}</span>
                <button class="btn btn-quiet text-small" onclick={() => run(() => admin.revokeInvitation(api, (inv as { id: string }).id, workspace.currentWorkspaceId))}>
                  {t('admin.revoke') ?? 'Revoke'}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else if section === 'codes'}
      <div class="rounded-card bg-brand-100 p-4 space-y-3">
        <h2>{t('admin.joinCodes') ?? 'Ephemeral join codes'}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input class="field" bind:value={newCodeLabel} placeholder={t('admin.label') ?? 'Label'} />
          <button type="button" class="btn btn-primary text-small" disabled={creatingCode} onclick={createCode}>
            {t('admin.createJoinCode') ?? 'Create'}
          </button>
        </div>
        {#if createdCode}
          <p class="text-small">{t('admin.createdCode') ?? 'Code (shown once)'}: <code>{createdCode}</code></p>
        {/if}
        {#if codesLoading}
          <p>{t('common.loading') ?? 'Loading…'}</p>
        {:else}
          <ul class="space-y-2">
            {#each codes as c (c.id)}
              <li class="text-small">
                <div class="flex items-center justify-between gap-2">
                  <span>{c.label ?? c.id} — uses {c.usedCount}{c.maxUses ? '/' + c.maxUses : ''}{c.autoApprove ? ' · auto' : ''} {c.revokedAt ? '(revoked)' : ''}</span>
                  <span class="flex gap-1">
                    {#if !c.revokedAt}
                      <button class="btn btn-quiet text-small" onclick={() => startEditCode(c)}>{t('admin.edit') ?? 'Edit'}</button>
                      <button class="btn btn-quiet text-small" onclick={async () => { error = null; try { await admin.revokeJoinCode(api, workspace.currentWorkspaceId, c.id); await loadCodes(); } catch (e) { error = describeFailure(e); } }}>
                        {t('admin.revoke') ?? 'Revoke'}
                      </button>
                    {/if}
                  </span>
                </div>
                {#if editingCodeId === c.id}
                  <form class="mt-1 flex flex-wrap items-center gap-2 border border-rule p-2" onsubmit={async (e) => { e.preventDefault(); await saveEditCode(); }}>
                    <label class="flex items-center gap-1">{t('admin.label') ?? 'Label'} <input class="field" type="text" bind:value={editLabel} /></label>
                    <label class="flex items-center gap-1">{t('admin.maxUses') ?? 'Max uses'} <input class="field w-20" type="number" min="0" bind:value={editMaxUses} /></label>
                    <label class="flex items-center gap-1">{t('admin.expiresAt') ?? 'Expires'} <input class="field" type="date" bind:value={editExpiresAt} /></label>
                    <label class="flex items-center gap-1"><input type="checkbox" bind:checked={editAutoApprove} /> {t('admin.autoApprove') ?? 'Auto-approve'}</label>
                    <button type="submit" class="btn btn-primary text-small" disabled={savingCode}>{t('admin.save') ?? 'Save'}</button>
                    <button type="button" class="btn btn-quiet text-small" onclick={() => (editingCodeId = null)}>{t('common.cancel') ?? 'Cancel'}</button>
                  </form>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>
{/if}
