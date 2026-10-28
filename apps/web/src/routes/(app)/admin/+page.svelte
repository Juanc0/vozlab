<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminWorkspaceDto, AdminMemberDto } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  let workspaces = $state<AdminWorkspaceDto[]>([]);
  let selectedId = $state<string | null>(null);
  let members = $state<AdminMemberDto[]>([]);
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
      const ws = await admin.createAdminWorkspace(api, {
        name: newName,
        slug: newSlug,
        description: newDesc || null,
        isPublic: newPublic
      });
      workspaces = [...workspaces, ws];
      selectedId = ws.id;
      newName = ''; newSlug = ''; newDesc = '';
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creating = false;
    }
  }

  const selected = $derived(workspaces.find((w) => w.id === selectedId) ?? null);

  async function createJoinCode() {
    if (!selectedId) return;
    creatingCode = true;
    try {
      const res = await admin.createJoinCode(api, selectedId, { label: newCodeLabel || null, autoApprove: false });
      createdCode = res.code;
      newCodeLabel = '';
    } catch (e) {
      error = describeFailure(e);
    } finally {
      creatingCode = false;
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
                onclick={() => (selectedId = w.id)}
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
        <p class="text-small text-muted">{t('admin.joinCode')}: <code>{selected.joinCode}</code></p>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={async () => {
            if (!selectedId) return;
            const code = await admin.rotateJoinCode(api, selectedId);
            const idx = workspaces.findIndex((w) => w.id === selectedId);
            if (idx >= 0) workspaces[idx] = { ...workspaces[idx], joinCode: code };
          }}
        >
          {t('admin.rotateJoinCode')}
        </button>

        <div class="border-t border-rule pt-3 space-y-2">
          <h3>{t('admin.createJoinCode') ?? 'Create ephemeral join code'}</h3>
          <input class="field w-full" bind:value={newCodeLabel} placeholder={t('admin.label') ?? 'Label'} />
          <button type="button" class="btn btn-primary" disabled={creatingCode} onclick={createJoinCode}>
            {t('admin.createJoinCode') ?? 'Create'}
          </button>
          {#if createdCode}
            <p class="text-small">{t('admin.createdCode') ?? 'Code (shown once)'}: <code>{createdCode}</code></p>
          {/if}
        </div>

        <h3>{t('admin.members')}</h3>
        <ul class="space-y-1">
          {#each members as m (m.userId)}
            <li class="flex items-center justify-between gap-2">
              <span>{m.email ?? m.userId} — {m.role} ({m.status})</span>
              <span class="flex gap-1">
                <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.suspendMember(api, selectedId, m.userId).then(loadMembers)}>{t('admin.suspend')}</button>
                <button class="btn btn-quiet text-small" onclick={() => selectedId && admin.removeMember(api, selectedId, m.userId).then(loadMembers)}>{t('admin.remove')}</button>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p>{t('admin.noWorkspaces')}</p>
      {/if}
    </div>
  </div>
</section>