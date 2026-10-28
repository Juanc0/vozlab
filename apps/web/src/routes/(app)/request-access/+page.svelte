<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiClient, getLocaleState } from '$lib/state/context';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import * as admin from '$lib/api/admin';
  import type { DiscoveredWorkspaceDto, MyJoinRequestDto } from '@vozlab/shared-types';

  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  let workspaces = $state<DiscoveredWorkspaceDto[]>([]);
  let requests = $state<MyJoinRequestDto[]>([]);
  let code = $state('');
  let message = $state('');
  let selectedWorkspaceId = $state<string | null>(null);
  let error = $state<ApiFailure | null>(null);

  async function load() {
    try {
      workspaces = await admin.discoverWorkspaces(api);
      requests = await admin.listMyJoinRequests(api);
    } catch (e) {
      error = describeFailure(e);
    }
  }

  onMount(load);

  async function requestAccess(workspaceId?: string) {
    try {
      await admin.requestWorkspaceAccess(api, {
        workspaceId,
        code: workspaceId ? undefined : code,
        message: message || undefined
      });
      await load();
    } catch (e) {
      error = describeFailure(e);
    }
  }
</script>

<svelte:head>
  <title>{t('requestAccess.title')}</title>
</svelte:head>

<section class="space-y-6">
  <h1>{t('requestAccess.title')}</h1>
  {#if error}
    <p role="alert" class="text-pill-negative-ink">{error.message}</p>
  {/if}

  <div class="rounded-card bg-brand-100 p-4 space-y-3">
    <h2>{t('requestAccess.discover')}</h2>
    {#if workspaces.length === 0}
      <p>{t('requestAccess.noWorkspaces')}</p>
    {:else}
      <ul class="space-y-2">
        {#each workspaces as w (w.id)}
          <li class="flex items-center justify-between">
            <span>{w.name}</span>
            <button class="btn btn-secondary text-small" onclick={() => requestAccess(w.id)} disabled={w.pendingRequest}>
              {w.pendingRequest ? '…' : t('requestAccess.request')}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="rounded-card bg-brand-100 p-4 space-y-3">
    <h2>{t('requestAccess.joinByCode')}</h2>
    <input class="field w-full" bind:value={code} placeholder={t('requestAccess.code')} />
    <input class="field w-full" bind:value={message} placeholder={t('requestAccess.message')} />
    <button class="btn btn-primary" onclick={() => requestAccess()}>{t('requestAccess.request')}</button>
  </div>

  <div class="rounded-card bg-brand-100 p-4 space-y-3">
    <h2>{t('requestAccess.myRequests')}</h2>
    <ul class="space-y-1">
      {#each requests as r (r.id)}
        <li>{r.workspaceName} — {r.status}</li>
      {/each}
    </ul>
  </div>
</section>