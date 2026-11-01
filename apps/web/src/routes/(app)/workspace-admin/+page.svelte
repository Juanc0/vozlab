<script lang="ts">
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { AdminWorkspaceDto } from '@vozlab/shared-types';
  import { UpdateWorkspaceSchema } from '@vozlab/shared-types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';

  const api = getApiClient();
  const locale = getLocaleState();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const t = locale.t;

  // Nested guard: this surface only makes sense for a workspace ADMIN.
  const canAdmin = $derived(workspace.isAdmin && workspace.currentWorkspaceId !== '');

  let ws = $state<AdminWorkspaceDto | null>(null);
  let loading = $state(false);
  let error = $state<ApiFailure | null>(null);

  // General section form
  let name = $state('');
  let description = $state('');
  let isPublic = $state(true);
  let saving = $state(false);
  let saved = $state(false);

  async function load(): Promise<void> {
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

  $effect(() => {
    if (canAdmin) load();
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
      <p role="alert" class="text-pill-negative-ink">{error.message}</p>
    {/if}

    <nav aria-label={t('workspaceAdmin.general')} class="flex gap-2 border-b border-rule">
      <span class="px-3 py-2 text-body font-medium text-accent">{t('workspaceAdmin.general')}</span>
    </nav>

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
  </section>
{/if}
