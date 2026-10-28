<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import type { SessionState } from '$lib/state/session.svelte';
  import { getApiClient } from '$lib/state/context';
  import { selectTenant } from '$lib/api/admin';
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;
  const session = getContext<SessionState>('session');
  const api = getApiClient();

  const gid = $derived(page.url.searchParams.get('gid') ?? '');
  let tenants = $state<Array<{ id: string; slug: string; status: string }>>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selecting = $state(false);

  $effect(() => {
    if (!gid) {
      loading = false;
      return;
    }
    (async () => {
      try {
        const body = await api.request<{ tenants: Array<{ id: string; slug: string; status: string }> }>({
          method: 'GET',
          path: `/auth/resolve-tenants?globalUserId=${encodeURIComponent(gid)}`,
          workspace: false
        });
        tenants = body.tenants ?? [];
      } catch (e) {
        error = (e as Error).message;
      } finally {
        loading = false;
      }
    })();
  });

  async function choose(tenantId: string) {
    selecting = true;
    error = null;
    try {
      await selectTenant(api, tenantId);
      // cookie set; refresh to get access token
      const body = await api.request<{ accessToken: string; expiresAt: string; user: any }>({
        method: 'POST',
        path: '/auth/refresh',
        workspace: false
      });
      session.setSession({ accessToken: body.accessToken, expiresAt: body.expiresAt, user: body.user });
      goto('/');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      selecting = false;
    }
  }
</script>

<main class="p-6 max-w-md mx-auto space-y-4">
  <h1 class="text-xl font-semibold">{t('admin.selectTenantTitle') ?? 'Select tenant'}</h1>
  {#if loading}
    <p>{t('common.loading') ?? 'Loading…'}</p>
  {:else if error}
    <p class="text-red-600">{error}</p>
  {:else if tenants.length === 0}
    <p>{t('admin.selectTenantNone') ?? 'No tenants linked to this account.'}</p>
  {:else}
    <ul class="space-y-2">
      {#each tenants as tn (tn.id)}
        <li>
          <button
            type="button"
            class="btn btn-primary w-full"
            disabled={selecting}
            onclick={() => choose(tn.id)}
          >
            {tn.slug} ({tn.status})
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>
