<script lang="ts">
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import * as ontologyApi from '$lib/api/ontology';
  import type { AdminMemberDto, AdminWorkspaceDto, JoinRequestDto } from '@vozlab/shared-types';
  import { UpdateWorkspaceSchema } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import ModalDialog from '$lib/components/ModalDialog.svelte';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  const targetWorkspaceId = $derived(workspace.currentWorkspaceId);

  const canAdmin = $derived(
    workspace.isAdmin && workspace.currentWorkspaceId !== ''
  );
  const isModerator = $derived(workspace.role === 'MODERATOR' || workspace.role === 'ADMIN');
  const currentAuthorHash = $derived(session.user?.authorHash ?? null);

  // Tab navigation.
  type WsTab = 'general' | 'members' | 'access' | 'codes' | 'eventCodes' | 'ontology';

  let activeTab = $state<WsTab>('general');

  const tabs = $derived.by(() => {
    const list: { id: WsTab; label: string }[] = [
      { id: 'general', label: t('workspaceAdmin.general') },
      { id: 'members', label: t('workspaceAdmin.members') },
      { id: 'access', label: t('workspaceAdmin.access') },
      { id: 'codes', label: t('workspaceAdmin.codes') }
    ];
    if (ws?.kind === 'EVENT') {
      list.push({ id: 'eventCodes', label: t('workspaceAdmin.eventCodes') });
    }
    list.push({ id: 'ontology', label: t('workspaceAdmin.ontology') });
    return list;
  });

  const panelId = 'workspace-admin-panel';

  function tabId(tab: WsTab): string {
    return `workspace-admin-tab-${tab}`;
  }

  function selectTab(tab: WsTab): void {
    activeTab = tab;
  }

  function onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    const tab = tabs[next];
    if (!tab) return;
    event.preventDefault();
    activeTab = tab.id;
    document.getElementById(tabId(tab.id))?.focus();
  }

  // Keep activeTab valid when tabs change.
  $effect(() => {
    if (!tabs.some((tb) => tb.id === activeTab)) {
      activeTab = 'general';
    }
  });

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
  let addMemberOpen = $state(false);

  $effect(() => {
    if (!addMemberOpen) return;
    addHandle = '';
    addRole = 'MEMBER';
  });

  // Access
  let joinRequests = $state<JoinRequestDto[]>([]);
  let accessLoading = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state('MEMBER');
  let creatingInvite = $state(false);
  let createdInviteLink = $state<string | null>(null);
  let invitations = $state<unknown[]>([]);
  let createInviteOpen = $state(false);

  $effect(() => {
    if (!createInviteOpen) return;
    inviteEmail = '';
    inviteRole = 'MEMBER';
  });

  // Codes
  let codes = $state<Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null; purpose?: string }>>([]);
  let codesLoading = $state(false);
  let newCodeLabel = $state('');
  let creatingCode = $state(false);
  let createdCode = $state<string | null>(null);
  let createCodeOpen = $state(false);

  $effect(() => {
    if (!createCodeOpen) return;
    newCodeLabel = '';
  });
  let editingCodeId = $state<string | null>(null);
  let editLabel = $state('');
  let editMaxUses = $state('');
  let editExpiresAt = $state('');
  let editAutoApprove = $state(false);
  let savingCode = $state(false);

  // Event codes (only for kind='EVENT' workspaces)
  let eventCodes = $state<Array<{ id: string; label: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; autoApprove: boolean; revokedAt: string | null }>>([]);
  let eventCodesLoading = $state(false);
  let newEventCodeLabel = $state('');
  let creatingEventCode = $state(false);
  let createdEventCode = $state<string | null>(null);
  let createEventCodeOpen = $state(false);

  $effect(() => {
    if (!createEventCodeOpen) return;
    newEventCodeLabel = '';
  });

  async function loadWorkspace(): Promise<void> {
    if (!canAdmin) return;
    loading = true;
    error = null;
    try {
      const loaded = await admin.getAdminWorkspace(api, targetWorkspaceId);
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
      createInviteOpen = false;
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
      codes = await admin.listJoinCodes(api, workspace.currentWorkspaceId, 'WORKSPACE');
    } catch (e) {
      error = describeFailure(e);
    } finally {
      codesLoading = false;
    }
  }

  async function loadEventCodes(): Promise<void> {
    if (!canAdmin) return;
    eventCodesLoading = true;
    try {
      eventCodes = await admin.listJoinCodes(api, workspace.currentWorkspaceId, 'EVENT');
    } catch (e) {
      error = describeFailure(e);
    } finally {
      eventCodesLoading = false;
    }
  }

  async function createEventCode(): Promise<void> {
    creatingEventCode = true;
    error = null;
    try {
      const res = await admin.createJoinCode(api, workspace.currentWorkspaceId, {
        label: newEventCodeLabel || null,
        purpose: 'EVENT',
        autoApprove: true
      });
      createdEventCode = res.code;
      newEventCodeLabel = '';
      createEventCodeOpen = false;
      await loadEventCodes();
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingEventCode = false;
    }
  }

  async function createCode(): Promise<void> {
    creatingCode = true;
    error = null;
    try {
      const res = await admin.createJoinCode(api, workspace.currentWorkspaceId, { label: newCodeLabel || null, autoApprove: false });
      createdCode = res.code;
      newCodeLabel = '';
      createCodeOpen = false;
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
      loadEventCodes();
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
      addMemberOpen = false;
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

  // Ontology proposals
  let ontologyProposals = $state<{
    classes: ontologyApi.OntologyProposalsDto['classes'];
    datatypeProperties: ontologyApi.OntologyProposalsDto['datatypeProperties'];
    objectProperties: ontologyApi.OntologyProposalsDto['objectProperties'];
  }>({
    classes: [],
    datatypeProperties: [],
    objectProperties: []
  });
  let ontologyLoading = $state(false);
  let ontologyError = $state<ApiFailure | null>(null);
  let ontologyActing = $state<string | null>(null);

  async function loadOntologyProposals(): Promise<void> {
    if (!canAdmin) return;
    ontologyLoading = true;
    ontologyError = null;
    try {
      ontologyProposals = await ontologyApi.listOntologyProposals(api);
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyLoading = false;
    }
  }

  function canActOnProposed(proposedBy: string): boolean {
    if (isModerator) return true;
    if (currentAuthorHash && proposedBy && currentAuthorHash === proposedBy) return true;
    return false;
  }

  async function activateDatatypeProperty(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.activateDatatypeProperty(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        datatypeProperties: ontologyProposals.datatypeProperties.filter((p) => p.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  async function rejectDatatypeProperty(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.rejectDatatypeProperty(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        datatypeProperties: ontologyProposals.datatypeProperties.filter((p) => p.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  async function activateObjectProperty(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.activateObjectProperty(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        objectProperties: ontologyProposals.objectProperties.filter((p) => p.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  async function rejectObjectProperty(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.rejectObjectProperty(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        objectProperties: ontologyProposals.objectProperties.filter((p) => p.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  async function activateClass(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.activateOntologyClass(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        classes: ontologyProposals.classes.filter((c) => c.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  async function rejectClass(id: string, proposedBy: string): Promise<void> {
    if (!canActOnProposed(proposedBy)) {
      ontologyError = describeFailure(new Error(t('ontologyAdmin.proposerOrModeratorOnly')));
      return;
    }
    ontologyActing = id;
    ontologyError = null;
    try {
      await ontologyApi.rejectOntologyClass(api, id);
      ontologyProposals = {
        ...ontologyProposals,
        classes: ontologyProposals.classes.filter((c) => c.id !== id)
      };
    } catch (e) {
      ontologyError = describeFailure(e);
    } finally {
      ontologyActing = null;
    }
  }

  $effect(() => {
    if (canAdmin && activeTab === 'ontology') {
      void loadOntologyProposals();
    }
  });
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

    <div role="tablist" aria-label={t('workspaceAdmin.title')} class="flex gap-4 border-b border-rule">
      {#each tabs as tab, index (tab.id)}
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
      {#if activeTab === 'general'}
        {#if loading}
          <p>{t('common.loading') ?? 'Loading…'}</p>
        {:else if ws}
          <div class="rounded-card bg-brand-100 p-4 space-y-3">
            <h2>{t('workspaceAdmin.general')}</h2>
            <form class="space-y-3 max-w-measure" onsubmit={saveGeneral}>
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
          </div>
        {:else}
          <p class="text-muted">{t('workspaceAdmin.loadFailed')}</p>
        {/if}

      {:else if activeTab === 'members'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2>{t('admin.members')}</h2>
            <button type="button" class="btn btn-primary" onclick={() => (addMemberOpen = true)}>
              {t('admin.addMember')}
            </button>
          </div>

          <!-- Row actions: member list -->
          {#if membersLoading}
            <p>{t('common.loading') ?? 'Loading…'}</p>
          {:else if grouped.length === 0}
            <p>{t('admin.noWorkspaces') ?? 'No members.'}</p>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="overflow-x-auto rounded-card bg-brand-100" role="region" aria-label={t('admin.members')} tabindex="0">
              <table class="w-full min-w-[34rem] border-collapse text-left text-body">
                <caption class="sr-only">{t('admin.members')}</caption>
                <thead class="text-small text-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.handle')}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.status') ?? 'Status'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.role')}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each grouped as g (g.userId)}
                    <tr class="border-t border-rule align-top">
                      <th scope="row" class="px-3 py-2 font-normal">{g.fullName ?? g.handle ?? g.userId}</th>
                      <td class="px-3 py-2">{g.status}</td>
                      <td class="px-3 py-2">
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
                      </td>
                      <td class="px-3 py-2">
                        <div class="flex items-center gap-2">
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
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <ModalDialog open={addMemberOpen} title={t('admin.addMember')} onclose={() => (addMemberOpen = false)}>
          <form class="space-y-2" onsubmit={(e) => { e.preventDefault(); addMemberDirect(); }}>
            <input class="field w-full" bind:value={addHandle} placeholder={t('admin.handle')} />
            <select class="field w-full" bind:value={addRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <div class="flex items-center gap-2">
              <button type="submit" class="btn btn-primary" disabled={adding}>
                {t('admin.addMember')}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => (addMemberOpen = false)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </ModalDialog>

      {:else if activeTab === 'access'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h2>{t('admin.joinRequests') ?? 'Join requests'}</h2>

          {#if accessLoading}
            <p>{t('common.loading') ?? 'Loading…'}</p>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="overflow-x-auto rounded-card bg-brand-100" role="region" aria-label={t('admin.joinRequests')} tabindex="0">
              <table class="w-full min-w-[34rem] border-collapse text-left text-body">
                <caption class="sr-only">{t('admin.joinRequests')}</caption>
                <thead class="text-small text-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.handle') ?? 'Requester'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.status') ?? 'Status'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each joinRequests as r (r.id)}
                    <tr class="border-t border-rule align-top">
                      <th scope="row" class="px-3 py-2 font-normal">{r.fullName ?? r.handle ?? r.userId}</th>
                      <td class="px-3 py-2">{r.status}</td>
                      <td class="px-3 py-2">
                        <div class="flex items-center gap-2">
                          <button class="btn btn-quiet text-small" onclick={() => approveRequest(r.id)}>{t('admin.approve') ?? 'Approve'}</button>
                          <button class="btn btn-quiet text-small" onclick={() => rejectRequest(r.id)}>{t('admin.reject') ?? 'Reject'}</button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="flex items-center justify-between gap-2 border-t border-rule pt-3">
              <h3>{t('admin.invitations') ?? 'Invitations'}</h3>
              <button type="button" class="btn btn-primary" onclick={() => (createInviteOpen = true)}>
                {t('admin.createInvitation') ?? 'Create invitation'}
              </button>
            </div>
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="overflow-x-auto rounded-card bg-brand-100" role="region" aria-label={t('admin.invitations')} tabindex="0">
              <table class="w-full min-w-[34rem] border-collapse text-left text-body">
                <caption class="sr-only">{t('admin.invitations')}</caption>
                <thead class="text-small text-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.role')}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.status') ?? 'Status'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.expiresAt') ?? 'Expires'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each invitations as inv ( (inv as { id: string }).id )}
                    <tr class="border-t border-rule align-top">
                      <td class="px-3 py-2">{(inv as { role?: string }).role ?? ''}</td>
                      <td class="px-3 py-2">{(inv as { status?: string }).status ?? ''}</td>
                      <td class="px-3 py-2">{(inv as { expiresAt?: string }).expiresAt ?? ''}</td>
                      <td class="px-3 py-2">
                        <button class="btn btn-quiet text-small" onclick={() => run(() => admin.revokeInvitation(api, (inv as { id: string }).id, workspace.currentWorkspaceId))}>
                          {t('admin.revoke') ?? 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if createdInviteLink}
              <p class="text-small">{t('admin.invitationLink') ?? 'Invitation link'}: <code class="break-all">{createdInviteLink}</code></p>
            {/if}
          {/if}
        </div>

        <ModalDialog open={createInviteOpen} title={t('admin.createInvitation')} onclose={() => (createInviteOpen = false)}>
          <form class="space-y-2" onsubmit={(e) => { e.preventDefault(); createInvite(); }}>
            <input class="field w-full" bind:value={inviteEmail} placeholder={t('admin.email') ?? 'Email'} />
            <select class="field w-full" bind:value={inviteRole}>
              <option value="MEMBER">MEMBER</option>
              <option value="MODERATOR">MODERATOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <div class="flex items-center gap-2">
              <button type="submit" class="btn btn-primary" disabled={creatingInvite}>
                {t('admin.createInvitation')}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => (createInviteOpen = false)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </ModalDialog>


      {:else if activeTab === 'codes'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2>{t('admin.joinCodes') ?? 'Ephemeral join codes'}</h2>
            <button type="button" class="btn btn-primary" onclick={() => (createCodeOpen = true)}>
              {t('admin.createJoinCode') ?? 'Create code'}
            </button>
          </div>

          {#if createdCode}
            <p class="text-small">{t('admin.createdCode') ?? 'Code (shown once)'}: <code>{createdCode}</code></p>
          {/if}

          <!-- Row actions: codes list -->
          {#if codesLoading}
            <p>{t('common.loading') ?? 'Loading…'}</p>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="overflow-x-auto rounded-card bg-brand-100" role="region" aria-label={t('admin.joinCodes')} tabindex="0">
              <table class="w-full min-w-[40rem] border-collapse text-left text-body">
                <caption class="sr-only">{t('admin.joinCodes')}</caption>
                <thead class="text-small text-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.label') ?? 'Label'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.purpose') ?? 'Purpose'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.uses') ?? 'Uses'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.expiresAt') ?? 'Expires'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.autoApprove') ?? 'Auto-approve'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each codes as c (c.id)}
                    <tr class="border-t border-rule align-top">
                      <th scope="row" class="px-3 py-2 font-normal">{c.label ?? c.id}</th>
                      <td class="px-3 py-2">{c.purpose ?? 'WORKSPACE'}</td>
                      <td class="px-3 py-2">{c.usedCount}{c.maxUses ? '/' + c.maxUses : ''}</td>
                      <td class="px-3 py-2">{c.expiresAt ?? ''}</td>
                      <td class="px-3 py-2">{c.autoApprove ? '✓' : ''}</td>
                      <td class="px-3 py-2">
                        <div class="flex items-center gap-2">
                          {#if !c.revokedAt}
                            <button class="btn btn-quiet text-small" onclick={() => startEditCode(c)}>{t('admin.edit') ?? 'Edit'}</button>
                            <button class="btn btn-quiet text-small" onclick={async () => { error = null; try { await admin.revokeJoinCode(api, workspace.currentWorkspaceId, c.id); await loadCodes(); } catch (e) { error = describeFailure(e); } }}>
                              {t('admin.revoke') ?? 'Revoke'}
                            </button>
                          {/if}
                          {#if c.revokedAt}
                            <span class="text-small text-muted">(revoked)</span>
                          {/if}
                        </div>
                      </td>
                    </tr>
                    {#if editingCodeId === c.id}
                      <tr class="border-t border-rule">
                        <td colspan="6" class="px-3 py-2">
                          <form class="flex flex-wrap items-center gap-2" onsubmit={async (e) => { e.preventDefault(); await saveEditCode(); }}>
                            <label class="flex items-center gap-1">{t('admin.label') ?? 'Label'} <input class="field" type="text" bind:value={editLabel} /></label>
                            <label class="flex items-center gap-1">{t('admin.maxUses') ?? 'Max uses'} <input class="field w-20" type="number" min="0" bind:value={editMaxUses} /></label>
                            <label class="flex items-center gap-1">{t('admin.expiresAt') ?? 'Expires'} <input class="field" type="date" bind:value={editExpiresAt} /></label>
                            <label class="flex items-center gap-1"><input type="checkbox" bind:checked={editAutoApprove} /> {t('admin.autoApprove') ?? 'Auto-approve'}</label>
                            <button type="submit" class="btn btn-primary text-small" disabled={savingCode}>{t('admin.save') ?? 'Save'}</button>
                            <button type="button" class="btn btn-quiet text-small" onclick={() => (editingCodeId = null)}>{t('common.cancel') ?? 'Cancel'}</button>
                          </form>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <ModalDialog open={createCodeOpen} title={t('admin.createJoinCode')} onclose={() => (createCodeOpen = false)}>
          <form class="space-y-2" onsubmit={(e) => { e.preventDefault(); createCode(); }}>
            <input class="field w-full" bind:value={newCodeLabel} placeholder={t('admin.label') ?? 'Label'} />
            <div class="flex items-center gap-2">
              <button type="submit" class="btn btn-primary" disabled={creatingCode}>
                {t('admin.createJoinCode')}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => (createCodeOpen = false)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </ModalDialog>

      {:else if activeTab === 'eventCodes'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2>{t('workspaceAdmin.eventCodes')}</h2>
            <button type="button" class="btn btn-primary" onclick={() => (createEventCodeOpen = true)}>
              {t('admin.createJoinCode') ?? 'Create event code'}
            </button>
          </div>

          {#if createdEventCode}
            <p class="text-small">{t('admin.createdCode') ?? 'Code (shown once)'}: <code>{createdEventCode}</code></p>
          {/if}

          <!-- Row actions: event codes list -->
          {#if eventCodesLoading}
            <p>{t('common.loading') ?? 'Loading…'}</p>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div class="overflow-x-auto rounded-card bg-brand-100" role="region" aria-label={t('workspaceAdmin.eventCodes')} tabindex="0">
              <table class="w-full min-w-[34rem] border-collapse text-left text-body">
                <caption class="sr-only">{t('workspaceAdmin.eventCodes')}</caption>
                <thead class="text-small text-muted">
                  <tr>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.label') ?? 'Label'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.uses') ?? 'Uses'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.expiresAt') ?? 'Expires'}</th>
                    <th scope="col" class="px-3 py-2 font-normal">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each eventCodes as c (c.id)}
                    <tr class="border-t border-rule align-top">
                      <th scope="row" class="px-3 py-2 font-normal">{c.label ?? c.id}</th>
                      <td class="px-3 py-2">{c.usedCount}{c.maxUses ? '/' + c.maxUses : ''}</td>
                      <td class="px-3 py-2">{c.expiresAt ?? ''}</td>
                      <td class="px-3 py-2">
                        {#if !c.revokedAt}
                          <button class="btn btn-quiet text-small" onclick={async () => { error = null; try { await admin.revokeJoinCode(api, workspace.currentWorkspaceId, c.id); await loadEventCodes(); } catch (e) { error = describeFailure(e); } }}>
                            {t('admin.revoke') ?? 'Revoke'}
                          </button>
                        {:else}
                          <span class="text-small text-muted">(revoked)</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <ModalDialog open={createEventCodeOpen} title={t('admin.createJoinCode')} onclose={() => (createEventCodeOpen = false)}>
          <form class="space-y-2" onsubmit={(e) => { e.preventDefault(); createEventCode(); }}>
            <input class="field w-full" bind:value={newEventCodeLabel} placeholder={t('admin.label') ?? 'Label'} />
            <div class="flex items-center gap-2">
              <button type="submit" class="btn btn-primary" disabled={creatingEventCode}>
                {t('admin.createJoinCode')}
              </button>
              <button type="button" class="btn btn-secondary" onclick={() => (createEventCodeOpen = false)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </ModalDialog>

      {:else if activeTab === 'ontology'}
        <div class="rounded-card bg-brand-100 p-4 space-y-3">
          <h2>{t('ontologyAdmin.title')}</h2>
          {#if ontologyError}
            <p role="alert" class="text-pill-negative-ink">{ontologyError.code}: {ontologyError.message}</p>
          {/if}
          {#if ontologyLoading}
            <p>{t('common.loading') ?? 'Loading…'}</p>
          {:else}
            <section class="space-y-2">
              <h3 class="text-body font-medium">{t('ontologyAdmin.classes')}</h3>
              {#if ontologyProposals.classes.length === 0}
                <p class="text-small text-muted">{t('ontologyAdmin.empty')}</p>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[40rem] border-collapse text-left text-body">
                    <thead class="text-small text-muted">
                      <tr>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.systemKey')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.proposedBy')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.status')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each ontologyProposals.classes as cls (cls.id)}
                        <tr class="border-t border-rule">
                          <th scope="row" class="px-2 py-1 font-normal">{cls.systemKey}</th>
                          <td class="px-2 py-1 text-small text-muted">{cls.proposedBy}</td>
                          <td class="px-2 py-1 text-small">{cls.status}</td>
                          <td class="px-2 py-1 flex gap-2">
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === cls.id || !canActOnProposed(cls.proposedBy)} onclick={() => activateClass(cls.id, cls.proposedBy)}>{t('ontologyAdmin.activate')}</button>
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === cls.id || !canActOnProposed(cls.proposedBy)} onclick={() => rejectClass(cls.id, cls.proposedBy)}>{t('ontologyAdmin.reject')}</button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>

            <section class="space-y-2">
              <h3 class="text-body font-medium">{t('ontologyAdmin.datatypeProperties')}</h3>
              {#if ontologyProposals.datatypeProperties.length === 0}
                <p class="text-small text-muted">{t('ontologyAdmin.empty')}</p>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[44rem] border-collapse text-left text-body">
                    <thead class="text-small text-muted">
                      <tr>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.systemKey')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.domain')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.datatype')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.proposedBy')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.status')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each ontologyProposals.datatypeProperties as p (p.id)}
                        <tr class="border-t border-rule">
                          <th scope="row" class="px-2 py-1 font-normal">{p.systemKey}</th>
                          <td class="px-2 py-1 text-small text-muted">{p.domainClassKey}</td>
                          <td class="px-2 py-1 text-small">{p.datatype}</td>
                          <td class="px-2 py-1 text-small text-muted">{p.proposedBy}</td>
                          <td class="px-2 py-1 text-small">{p.status}</td>
                          <td class="px-2 py-1 flex gap-2">
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === p.id || !canActOnProposed(p.proposedBy)} onclick={() => activateDatatypeProperty(p.id, p.proposedBy)}>{t('ontologyAdmin.activate')}</button>
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === p.id || !canActOnProposed(p.proposedBy)} onclick={() => rejectDatatypeProperty(p.id, p.proposedBy)}>{t('ontologyAdmin.reject')}</button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>

            <section class="space-y-2">
              <h3 class="text-body font-medium">{t('ontologyAdmin.objectProperties')}</h3>
              {#if ontologyProposals.objectProperties.length === 0}
                <p class="text-small text-muted">{t('ontologyAdmin.empty')}</p>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[44rem] border-collapse text-left text-body">
                    <thead class="text-small text-muted">
                      <tr>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.systemKey')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.domain')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.range')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.proposedBy')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.status')}</th>
                        <th scope="col" class="px-2 py-1">{t('ontologyAdmin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each ontologyProposals.objectProperties as p (p.id)}
                        <tr class="border-t border-rule">
                          <th scope="row" class="px-2 py-1 font-normal">{p.systemKey}</th>
                          <td class="px-2 py-1 text-small text-muted">{p.domainClassKey}</td>
                          <td class="px-2 py-1 text-small text-muted">{p.rangeClassKey}</td>
                          <td class="px-2 py-1 text-small text-muted">{p.proposedBy}</td>
                          <td class="px-2 py-1 text-small">{p.status}</td>
                          <td class="px-2 py-1 flex gap-2">
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === p.id || !canActOnProposed(p.proposedBy)} onclick={() => activateObjectProperty(p.id, p.proposedBy)}>{t('ontologyAdmin.activate')}</button>
                            <button class="btn btn-quiet text-small" disabled={ontologyActing === p.id || !canActOnProposed(p.proposedBy)} onclick={() => rejectObjectProperty(p.id, p.proposedBy)}>{t('ontologyAdmin.reject')}</button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>
          {/if}
        </div>

      {/if}
    </div>
  </section>
{/if}