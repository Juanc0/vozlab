<script lang="ts">
  import { getWorkspaceState } from '$lib/state/context';

  const workspace = getWorkspaceState();

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
  <label
    for="workspace-select"
    class="block text-xs font-semibold tracking-wide text-ink-muted uppercase"
  >
    Workspace
  </label>

  <select
    id="workspace-select"
    class="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:bg-surface-muted"
    value={workspace.currentWorkspaceId}
    disabled={workspace.workspaces.length === 0}
    onchange={handleChange}
  >
    {#each workspace.workspaces as item (item.id)}
      <option value={item.id}>{item.name}</option>
    {/each}
  </select>

  <p class="text-xs text-ink-muted">
    {#if active}
      Your role here:
      <span class="font-semibold text-ink">{active.role}</span>
    {:else}
      No workspace selected.
    {/if}
  </p>
</div>
