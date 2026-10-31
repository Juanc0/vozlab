<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminWorkspaceDto, AdminMemberDto, JoinRequestDto } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  let workspaces = $state<AdminWorkspaceDto[]>([]);
  let selectedId = $state<string | null>(null);
  let members = $state<AdminMemberDto[]>([]);
  let joinRequests = $state<JoinRequestDto[]>([]);
  let loading = $state(false);
  let error = $state<ApiFailure | null>(null);

  // create workspace form
  let newName = $state('');
  let newSlug = $state('');
  let newDesc = $state('');
  let newPublic = $state(true);
  let creating = $state(false);
  let newCodeLabel = $state('');
  let createdCode = $state<string | null>(null);
  let creatingCode = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state('MEMBER');
  let createdInviteLink = $state<string | null>(null);
  let creatingInvite = $state(false);
  // ADR-0045 reveal-once: the raw workspace join code exists only right
  // after create or rotate — the stored hash is never fetched back.
  let revealedJoinCode = $state<string | null>(null);
  let joinCodes = $state<Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null }>>([]);
  // v6/TASK-04 (B6): inline patch of a code's mutable attributes.
  let editingCodeId = $state<string | null>(null);
  let editLabel = $state('');
  let editMaxUses = $state('');
  let editExpiresAt = $state('');
  let editAutoApprove = $state(false);
  let savingCode = $state(false);
  let addMemberHandle = $state('');
  let addMemberRole = $state('MEMBER');
  let addingMember = $state(false);
  // v6/TASK-09 (B7): the tenant hygiene sweep.
  let cleanupDays = $state('30');
  let runningCleanup = $state(false);
  let cleanupResult = $state<string | null>(null);

  async function loadWorkspaces() {
    loading = true; error = null;
    try {
      workspaces = await admin.listAdminWorkspaces(api);
      if (!selectedId && workspaces.length) selectedId = workspaces[0].id;
    } catch (e) {
      error = describeFailure(e);
      await redirectToLoginOnAuthFailure(error, workspace, '/admin');
    } finally {
      loading = false;
    }
  }

  async function loadMembers() {
    if (!selectedId) return;
    try {
      members = await admin.listMembers(api, selectedId);
      joinRequests = await admin.listJoinRequests(api, selectedId);
      joinCodes = await admin.listJoinCodes(api, selectedId);
    } catch (e) {
      error = describeFailure(e);
    }
  }

  $effect(() => {
    if (selectedId) loadMembers();
  });

  onMount(loadWorkspaces);

  async function createWorkspace() {
    creating = true; error = null;
    try {
      const { joinCode, ...ws } = await admin.createAdminWorkspace(api, {
        name: newName,
        slug: newSlug,
        description: newDesc || null,
        isPublic: newPublic
      });
      workspaces = [...workspaces, ws];
      selectedId = ws.id;
      // The default code is revealed exactly here, once (ADR-0045).
      revealedJoinCode = joinCode;
      newName = ''; newSlug = ''; newDesc = '';
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creating = false;
    }
  }

  const selected = $derived(workspaces.find((w) => w.id === selectedId) ?? null);

  async function createInvite() {
    if (!selectedId) return;
    creatingInvite = true;
    try {
      // DEC-9: the workspace invitation route is the ONLY invitation
      // mechanism — same-org and external invitees take the identical path
      // (72 h, single-use, re-send invalidates). The answer carries the
      // copyable link, shown exactly once.
      const res = await admin.createInvitation(api, selectedId, {
        email: inviteEmail,
        role: inviteRole as 'MEMBER' | 'MODERATOR' | 'ADMIN',
      });
      createdInviteLink = res.url;
      inviteEmail = '';
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingInvite = false;
    }
  }

  async function createJoinCode() {
    if (!selectedId) return;
    creatingCode = true;
    try {
      const res = await admin.createJoinCode(api, selectedId, { label: newCodeLabel || null, autoApprove: false });
      createdCode = res.code;
      newCodeLabel = '';
      // The list of codes must show the row just created (with its Edit and
      // Revoke controls); before v6/TASK-04 the list stayed stale until the
      // next membership reload.
      await loadMembers();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingCode = false;
    }
  }

  function startEditCode(c: (typeof joinCodes)[number]): void {
    editingCodeId = c.id;
    editLabel = c.label ?? '';
    editMaxUses = c.maxUses === null ? '' : String(c.maxUses);
    editExpiresAt = c.expiresAt ? c.expiresAt.slice(0, 10) : '';
    editAutoApprove = c.autoApprove;
  }

  async function saveEditCode(): Promise<void> {
    if (!selectedId || !editingCodeId) return;
    savingCode = true;
    try {
      await admin.updateJoinCode(api, selectedId, editingCodeId, {
        label: editLabel || null,
        // The date input carries no time or zone; the code lives until the
        // end of the chosen day.
        expiresAt: editExpiresAt ? new Date(`${editExpiresAt}T23:59:59`).toISOString() : null,
        maxUses: editMaxUses === '' ? null : Number(editMaxUses),
        autoApprove: editAutoApprove
      });
      editingCodeId = null;
      await loadMembers();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      savingCode = false;
    }
  }

  async function addMemberDirect() {
    if (!selectedId) return;
    addingMember = true;
    try {
      await admin.addMember(api, selectedId, addMemberHandle, addMemberRole);
      addMemberHandle = '';
      await loadMembers();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      addingMember = false;
    }
  }

  async function runTenantCleanup() {
    runningCleanup = true;
    cleanupResult = null;
    try {
      // The `type="number"` binding hands back a number as soon as the
      // operator edits the field (and the initial `'30'` is a string): read
      // both shapes through `String` or the sweep throws on `.trim`.
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
            <li>
              <button
                type="button"
                class="w-full text-left rounded-control px-2 py-1 hover:bg-raised {selectedId === w.id ? 'bg-accent-soft' : ''}"
                onclick={() => { selectedId = w.id; revealedJoinCode = null; createdCode = null; }}
              >
                {w.name} <span class="text-muted text-small">({w.memberCount})</span> <span class="text-small text-accent">{w.kind}</span>
              </button>
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
        <button type="submit" class="btn btn-primary" disabled={creating}>
          {t('admin.createWorkspace')}
        </button>
      </form>
    </div>

    <div class="rounded-card bg-brand-100 p-4 space-y-3">
      {#if selected}
        <h2>{selected.name}</h2>
        <div class="border-t border-rule pt-3 space-y-2">
          <h3>{t('admin.joinCode') ?? 'Join code'}</h3>
          <!-- ADR-0045: the stored code is a hash and is never fetched. The
               raw value exists only right after create or rotate. -->
          {#if revealedJoinCode}
            <div class="rounded-control bg-surface-2 p-2 space-y-1">
              <p class="text-small">
                {t('admin.joinCodeShownOnce') ?? 'Join code (shown once)'}: <code class="break-all">{revealedJoinCode}</code>
              </p>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="btn btn-quiet text-small"
                  onclick={async () => {
                    try { await navigator.clipboard.writeText(revealedJoinCode ?? ''); } catch { /* clipboard denied */ }
                  }}
                >
                  {t('admin.copyCode') ?? 'Copy'}
                </button>
                <button type="button" class="btn btn-quiet text-small" onclick={() => (revealedJoinCode = null)}>
                  {t('common.hide') ?? 'Hide'}
                </button>
              </div>
            </div>
          {:else}
            <p class="text-small text-muted">
              {t('admin.joinCodeHidden') ?? 'Only the hash is stored — the code is shown once. Rotate to get a new one.'}
            </p>
          {/if}
          <button
            type="button"
            class="btn btn-secondary"
            onclick={async () => {
              if (!selectedId) return;
              try {
                revealedJoinCode = await admin.rotateJoinCode(api, selectedId);
                await loadMembers();
              } catch (e) {
                error = describeFailure(e);
              }
            }}
          >
            {t('admin.rotateJoinCode')}
          </button>
        </div>

        <div class="border-t border-rule pt-3 space-y-2">
          <h3>{t('admin.createJoinCode') ?? 'Create ephemeral join code'}</h3>
          <input class="field w-full" bind:value={newCodeLabel} placeholder={t('admin.label') ?? 'Label'} />
          <button type="button" class="btn btn-primary" disabled={creatingCode} onclick={createJoinCode}>
            {t('admin.createJoinCode') ?? 'Create'}
          </button>
          {#if createdCode}
            <p class="text-small">{t('admin.createdCode') ?? 'Code (shown once)'}: <code>{createdCode}</code></p>
          {/if}

          <div class="border-t border-rule pt-3 space-y-2">
            <h3>{t('admin.invitations') ?? 'Invitations'}</h3>
            <input class="field w-full" bind:value={inviteEmail} placeholder={t('admin.email') ?? 'Email'} />
            <select class="field w-full" bind:value={inviteRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button type="button" class="btn btn-primary" disabled={creatingInvite} onclick={createInvite}>
              {t('admin.createInvitation') ?? 'Create invitation'}
            </button>
            {#if createdInviteLink}
              <p class="text-small">{t('admin.invitationLink') ?? 'Invitation link'}: <code>{createdInviteLink}</code></p>
            {/if}
          </div>

          <h4>{t('admin.joinCodes') ?? 'Ephemeral join codes'}</h4>
          <ul class="space-y-1">
            {#each joinCodes as c (c.id)}
              <li class="text-small">
                <div class="flex items-center justify-between gap-2">
                  <span>{c.label ?? c.id} — uses {c.usedCount}{c.maxUses ? '/' + c.maxUses : ''}{c.autoApprove ? ' · auto' : ''} {c.revokedAt ? '(revoked)' : ''}</span>
                  <span class="flex gap-1">
                    {#if !c.revokedAt}
                      <button class="btn btn-quiet text-small" onclick={() => startEditCode(c)}>{t('admin.edit') ?? 'Edit'}</button>
                      <button class="btn btn-quiet text-small" onclick={async () => { if (selectedId) { await admin.revokeJoinCode(api, selectedId, c.id); await loadMembers(); } }}>{t('admin.revoke') ?? 'Revoke'}</button>
                    {/if}
                  </span>
                </div>
                {#if editingCodeId === c.id}
                  <form
                    class="mt-1 flex flex-wrap items-center gap-2 border border-rule p-2"
                    onsubmit={async (e) => { e.preventDefault(); await saveEditCode(); }}
                  >
                    <label class="flex items-center gap-1">
                      {t('admin.label') ?? 'Label'}
                      <input class="field" type="text" bind:value={editLabel} />
                    </label>
                    <label class="flex items-center gap-1">
                      {t('admin.maxUses') ?? 'Max uses'}
                      <input class="field w-20" type="number" min="0" bind:value={editMaxUses} />
                    </label>
                    <label class="flex items-center gap-1">
                      {t('admin.expiresAt') ?? 'Expires'}
                      <input class="field" type="date" bind:value={editExpiresAt} />
                    </label>
                    <label class="flex items-center gap-1">
                      <input type="checkbox" bind:checked={editAutoApprove} />
                      {t('admin.autoApprove') ?? 'Auto-approve'}
                    </label>
                    <button type="submit" class="btn btn-primary text-small" disabled={savingCode}>{t('admin.save') ?? 'Save'}</button>
                    <button type="button" class="btn btn-quiet text-small" onclick={() => (editingCodeId = null)}>{t('common.cancel') ?? 'Cancel'}</button>
                  </form>
                {/if}
              </li>
            {/each}
          </ul>
        </div>

        <div class="border-t border-rule pt-3 space-y-2">
          <h3>{t('admin.addMember') ?? 'Add member directly'}</h3>
          <input class="field w-full" bind:value={addMemberHandle} placeholder={t('admin.handle') ?? 'Handle'} />
          <select class="field w-full" bind:value={addMemberRole}>
            <option value="MEMBER">MEMBER</option>
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="button" class="btn btn-primary" disabled={addingMember} onclick={addMemberDirect}>
            {t('admin.addMember') ?? 'Add'}
          </button>
        </div>

        <h3>{t('admin.members')}</h3>
        <ul class="space-y-1">
          {#each Object.values(members.reduce((acc, m) => {
            if (!acc[m.userId]) acc[m.userId] = { userId: m.userId, handle: m.handle, fullName: m.fullName, roles: [], status: m.status };
            acc[m.userId].roles.push(m.role);
            return acc;
          }, {} as Record<string, { userId: string; handle: string | null; fullName: string | null; roles: string[]; status: string }>)) as g (g.userId)}
            <li class="flex flex-col gap-1 border-b border-rule py-1">
              <div class="flex items-center justify-between gap-2">
                <span>{g.fullName ?? g.handle ?? g.userId} ({g.status})</span>
                <span class="flex gap-1">
                  <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.suspendMember(api, selectedId, g.userId).then(loadMembers)}>{t('admin.suspend')}</button>
                  <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.removeMember(api, selectedId, g.userId).then(loadMembers)}>{t('admin.remove')}</button>
                </span>
              </div>
              <div class="flex flex-wrap gap-1">
                {#each g.roles as r (r)}
                  <span class="text-small px-2 py-0.5 rounded bg-surface-2">{r}
                    <button class="ml-1 text-small" onclick={() => selectedId && admin.removeMemberRole(api, selectedId, g.userId, r).then(loadMembers)}>×</button>
                  </span>
                {/each}
                <select class="field text-small" onchange={async (e) => { const v = (e.target as HTMLSelectElement).value; if (v && selectedId) { await admin.assignMemberRole(api, selectedId, g.userId, v); await loadMembers(); } }}>
                  <option value="">{t('admin.addRole') ?? 'Add role…'}</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="MODERATOR">MODERATOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </li>
          {/each}
        </ul>

        <h3>{t('admin.joinRequests') ?? 'Join requests'}</h3>
        <ul class="space-y-1">
          {#each joinRequests as r (r.id)}
            <li class="flex items-center justify-between gap-2">
              <span>{r.userId} — {r.status}</span>
              <span class="flex gap-1">
                <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.approveJoinRequest(api, selectedId, r.id).then(loadMembers)}>{t('admin.approve') ?? 'Approve'}</button>
                <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.rejectJoinRequest(api, selectedId, r.id).then(loadMembers)}>{t('admin.reject') ?? 'Reject'}</button>
              </span>
            </li>
          {/each}
        </ul>

        <div class="border-t border-rule pt-3 space-y-2">
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
      {:else}
        <p>{t('admin.noWorkspaces')}</p>
      {/if}
    </div>
  </div>
</section>