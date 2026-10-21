<script lang="ts">
  import type { Snippet } from 'svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';
  import PwaStatus from '$lib/components/PwaStatus.svelte';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
  import { getLocaleState } from '$lib/state/context';

  interface Props {
    title?: string;
    children?: Snippet;
  }

  let { title = 'VozLab', children }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;
</script>

<div class="flex min-h-dvh flex-col bg-surface-muted text-ink">
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-brand-900 focus:px-4 focus:py-2 focus:text-white"
  >
    {t('shell.skipToContent')}
  </a>

  <header class="border-b border-line bg-surface">
    <div class="mx-auto flex w-full items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        class="grid size-8 place-items-center rounded-md bg-brand-900 text-sm font-bold text-white"
      >
        V
      </span>
      <span class="text-lg font-semibold tracking-tight">{title}</span>
    </div>
  </header>

  <!--
    The notices of the shell.

    They sit between the header and the content: the connectivity, the
    state of the PWA, the install offer and the pending service-worker
    update are the things the user must know about before reading anything
    else. Each notice renders nothing at all when it does not apply — an
    empty strip is never left behind.
  -->
  <OfflineBanner />
  <PwaStatus />
  <InstallPrompt />
  <UpdatePrompt />

  <!--
    The content of the shell is **not** capped: the graph page needs the
    whole window for its canvas and its inspector. The pages that read
    better in a narrow column cap themselves.
  -->
  <main id="main-content" class="mx-auto w-full flex-1 px-4 py-8">
    {@render children?.()}
  </main>

  <footer class="border-t border-line bg-surface">
    <div class="mx-auto w-full px-4 py-4 text-sm text-ink-muted">
      {t('shell.footer')}
    </div>
  </footer>
</div>
