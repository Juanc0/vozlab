<script lang="ts">
  import { getLocaleState, getWorkspaceState } from '$lib/state/context';

  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The membership of the **active** workspace.
   *
   * The role is never guessed: it comes from the membership the API sent in
   * `GET /auth/me`. There is no `VIEWER` role — the roles are `ADMIN`,
   * `MODERATOR` and `MEMBER`.
   */
  const active = $derived(
    workspace.workspaces.find((item) => item.id === workspace.currentWorkspaceId) ?? null
  );

  function handleChange(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    // The choice is persisted per tab (`sessionStorage`), never in
    // `localStorage`: switching a workspace in one tab must not change
    // another one.
    workspace.setWorkspace(select.value);
  }
</script>

<div class="space-y-1.5">
  <label for="workspace-select" class="block text-small text-muted">
    {t('workspace.label')}
  </label>

  <select
    id="workspace-select"
    class="field w-full"
    value={workspace.currentWorkspaceId}
    disabled={workspace.workspaces.length === 0}
    onchange={handleChange}
  >
    {#each workspace.workspaces as item (item.id)}
      <option value={item.id}>{item.name}</option>
    {/each}
  </select>

  <p class="text-small text-muted">
    {#if active}
      {t('workspace.yourRole')}
      <span class="font-medium text-text">{active.role}</span>
    {:else}
      {t('workspace.noneSelected')}
    {/if}
  </p>
</div>
