<script lang="ts">
  /**
   * The tenant switcher (v6/TASK-01: closing the selector loop).
   *
   * A global identity can be linked to more than one institution. Once the
   * session exists, the PWA knows its `globalUserId` (`GET /auth/me`), so the
   * change is a plain `POST /auth/switch-tenant`: the API validates the link,
   * rotates the refresh cookie for the destination tenant and the app
   * re-adopts the session. **No re-authentication.**
   *
   * The control renders only when there is something to switch: no global
   * identity, or a single ACTIVE linked tenant, leaves the block hidden.
   */
  import { goto } from '$app/navigation';
  import { listLinkedTenants, switchTenant, type LinkedTenantDto } from '$lib/api/admin';
  import { refreshSession } from '$lib/api/auth';
  import { loadMemberships } from '$lib/auth/restore';
  import {
    getApiClient,
    getLocaleState,
    getSessionState,
    getWorkspaceState
  } from '$lib/state/context';

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  let tenants = $state<LinkedTenantDto[]>([]);
  let switching = $state(false);
  let error = $state<string | null>(null);

  const globalUserId = $derived(session.globalUserId);

  /** Only a tenant the identity is ACTIVELY linked to can be entered. */
  const switchable = $derived(tenants.filter((tenant) => tenant.status === 'ACTIVE'));
  // Truthy on purpose: a payload minted before the field exists must not
  // trigger a fetch with an `undefined` globalUserId.
  const visible = $derived(Boolean(globalUserId) && switchable.length > 1);

  $effect(() => {
    const gid = globalUserId;
    if (!gid) {
      tenants = [];
      return;
    }
    // Re-read the links whenever the identity changes (login, restore).
    void (async () => {
      try {
        tenants = await listLinkedTenants(api, gid);
      } catch {
        // A failed list leaves the switcher with nothing to offer: the
        // session keeps working inside its current tenant.
        tenants = [];
      }
    })();
  });

  async function handleChange(event: Event): Promise<void> {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    const destination = select.value;
    const gid = globalUserId;
    if (gid === null || destination === session.currentTenantId) {
      return;
    }

    switching = true;
    error = null;
    try {
      // 1. The API validates the link and rotates the cookie for `destination`.
      await switchTenant(api, gid, destination);
      // 2. The new cookie trades for a new access token (serialized per tab).
      session.setSession(await refreshSession(api));
      // 3. The memberships are those of the destination tenant: reload them.
      //    `hydrate` drops the workspace that belonged to the previous tenant.
      await loadMemberships({ client: api, session, workspace });
      await goto('/');
    } catch (e) {
      error = e instanceof Error ? e.message : t('tenant.switchFailed');
      // Leave the control on the truth: the session never moved.
      select.value = session.currentTenantId ?? '';
    } finally {
      switching = false;
    }
  }
</script>

{#if visible}
  <div class="space-y-1.5">
    <label for="tenant-select" class="block text-small text-muted">
      {t('tenant.label')}
    </label>

    <select
      id="tenant-select"
      class="field w-full"
      value={session.currentTenantId ?? ''}
      disabled={switching}
      onchange={handleChange}
    >
      {#each switchable as tenant (tenant.id)}
        <option value={tenant.id}>{tenant.slug}</option>
      {/each}
    </select>

    {#if switching}
      <p class="text-small text-muted">{t('tenant.switching')}</p>
    {/if}
    {#if error}
      <p role="alert" class="text-small text-pill-negative-ink">{error}</p>
    {/if}
  </div>
{/if}
