<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getApiClient, getLocaleState, getSessionState } from '$lib/state/context';
  import { listLinkedTenants, selectTenant, type LinkedTenantDto } from '$lib/api/admin';
  import { refreshSession } from '$lib/api/auth';

  const locale = getLocaleState();
  const t = locale.t;
  const session = getSessionState();
  const api = getApiClient();

  const gid = $derived(page.url.searchParams.get('guid') ?? '');
  let tenants = $state<LinkedTenantDto[]>([]);
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
        tenants = await listLinkedTenants(api, gid);
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
      // The API answers by setting the refresh cookie for the chosen tenant.
      await selectTenant(api, gid, tenantId);
      // The cookie is shared by every tab: trade it for the access token
      // through the serialized refresh, exactly like the restore does.
      session.setSession(await refreshSession(api));
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
