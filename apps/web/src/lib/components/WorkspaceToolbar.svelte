<script lang="ts">
  /**
   * The **floating toolbar** of the workspace.
   *
   * It is the frame of the picture, not a page above it: the title, the
   * switch between the two views of the graph and the controls of the view
   * on screen live here, over the canvas, the way Excalidraw and draw.io
   * keep their controls at the top of the picture.
   *
   * The panel is **solid** and it holds the only filled button of the
   * whole interface — the one that creates a node.
   */
  import type { Snippet } from 'svelte';
  import type { NodeDto } from '$lib/api/types';
  import FloatingPanel from '$lib/components/FloatingPanel.svelte';
  import NodeSearch from '$lib/components/NodeSearch.svelte';
  import { getLocaleState } from '$lib/state/context';

  /** The two views of the graph. */
  import ZoomControls from '$lib/components/ZoomControls.svelte';

  type ViewMode = 'subgraph' | 'explore';

  interface Props {
    /** The view of the graph on screen. */
    viewMode: ViewMode;
    /** Called when the user changes the view. */
    onviewmodechange: (mode: ViewMode) => void;
    /** `true` while the list — the text alternative of the canvas — is on screen. */
    listOpen: boolean;
    /** Called when the user swaps the canvas for the list. */
    onlisttoggle: () => void;
    /** `true` while the inspector is open. */
    inspectorOpen: boolean;
    /** Called when the user folds or opens the inspector. */
    oninspectortoggle: () => void;
    /** The id of the panel the inspector toggle controls. */
    inspectorControlsId: string;
    /** `true` when the form of the node cannot be opened yet. */
    newNodeDisabled?: boolean;
    /** Called when the user wants to create a node. */
    onnewnode: () => void;
    /** Comes closer to the picture. */
    onzoomin?: () => void;
    /** Goes away from the picture. */
    onzoomout?: () => void;
    /** Puts the whole picture in view. */
    onfit?: () => void;
    /** Untangles the picture: the arrangement runs again and settles. */
    onuntangle?: () => void;
    /** The id of the description of the list — it says what the alternative is. */
    listDescriptionId: string;
    /** The extra classes of the panel — its width. */
    panelClass?: string;
    /** The nodes the toolbar search can find. */
    searchNodes?: NodeDto[];
    /** Called with the id of the node the reader searched for. */
    onsearchselect?: (nodeId: string) => void;
    /**
     * Called when the panel changes its height.
     *
     * The list is the other half of the workspace and it must not run
     * under the toolbar: the page insets it with the height of the panel.
     */
    onheight?: (height: number) => void;
    /** The controls of the view on screen. */
    controls?: Snippet;
    /** The failures and the notices of the view on screen. */
    status?: Snippet;

  }

  let {
    viewMode,
    onviewmodechange,
    listOpen,
    onlisttoggle,
    inspectorOpen,
    oninspectortoggle,
    inspectorControlsId,
    newNodeDisabled = false,
    onnewnode,
    onzoomin,
    onzoomout,
    onfit,
    onuntangle,
    listDescriptionId,
    panelClass = '',
    onheight,
    controls,
    status,
    searchNodes,
    onsearchselect
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();

  /** The name of the radio group of the two views. */
  const groupName = `graph-view-mode-${uid}`;

  /** The two views, in the order the switch shows them. */
  const VIEW_MODES: readonly ViewMode[] = ['subgraph', 'explore'];

  /** The element of the panel. */
  let panel: HTMLElement | undefined = $state();

  /** The callback is read through a holder: the parent may pass a new one. */
  let heightHandler: ((height: number) => void) | undefined;

  $effect(() => {
    heightHandler = onheight;
  });

  /**
   * The height of the panel is told to the page.
   *
   * The panel grows with the controls of the view on screen, and the list
   * has to start below it: a list that runs under a floating panel is a
   * list the reader cannot click.
   */
  $effect(() => {
    const element = panel;

    if (element === undefined) {
      return;
    }

    const report = (): void => {
      heightHandler?.(element.offsetHeight);
    };

    report();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(report);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });
</script>

<FloatingPanel
  bind:element={panel}
  placement="top-left"
  label={t('graph.toolbarLabel')}
  {panelClass}
>
  <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 py-2">
    <!--
      The left zone: the title of the screen and the search that takes the
      reader to a node. The title is the one element of the interface that
      is set in the serif; the search takes the rest of the width.
    -->
    <div class="flex min-w-0 items-center gap-3">
      <h1 class="shrink-0 text-kpi">{t('graph.heading')}</h1>
      <NodeSearch nodes={searchNodes ?? []} onselect={onsearchselect} />
    </div>

    <!--
      The centre zone: the switch between the two views of the graph, the
      zoom and the untangle. They are the tools of the picture, and they
      wear the muted ink of the toolbar.
    -->
    <div class="flex items-center gap-3">
      <fieldset>
        <legend class="sr-only">{t('graph.viewModeLabel')}</legend>
        <div class="inline-flex gap-1 rounded-control bg-raised p-1">
          {#each VIEW_MODES as mode (mode)}
            <input
              type="radio"
              id="graph-view-{mode}-{uid}"
              name={groupName}
              value={mode}
              class="peer sr-only"
              checked={viewMode === mode}
              onchange={() => onviewmodechange(mode)}
            />
            <label
              for="graph-view-{mode}-{uid}"
              class="pointer-coarse:min-h-11 cursor-pointer rounded-control px-3 py-1.5 text-body font-medium text-muted hover:text-text peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
            >
              {mode === 'explore' ? t('graph.modeExplore') : t('graph.modeSubgraph')}
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="flex items-center gap-3">
        <ZoomControls {onzoomin} {onzoomout} {onfit} />

        <button
          type="button"
          class="btn btn-secondary"
          onclick={onuntangle}
        >
          {t('graph.untangle')}
        </button>
      </div>
    </div>

    <!--
      The right zone: the actions of the screen — create, list toggle,
      inspector toggle.
    -->
    <div class="flex items-center gap-2 justify-self-end">
      <button
        type="button"
        class="btn btn-primary"
        disabled={newNodeDisabled}
        onclick={onnewnode}
      >
        {t('graph.newNode')}
      </button>

      <button
        type="button"
        class="btn btn-secondary aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-ink"
        aria-pressed={listOpen}
        aria-describedby={listDescriptionId}
        onclick={onlisttoggle}
      >
        {t('graph.listToggle')}
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        aria-expanded={inspectorOpen}
        aria-controls={inspectorControlsId}
        onclick={(event) => {
          event.currentTarget.focus();
          oninspectortoggle();
        }}
      >
        {inspectorOpen ? t('inspector.collapse') : t('inspector.expand')}
      </button>
    </div>
  </div>

  <!--
    The controls of the view on screen. They are **many** — the criterion
    of the focus, the depth, the shape of the arrows, the far nodes — and a
    phone has no room for them: there the row is a horizontal scroller.
  -->
  <div class="px-3 pb-3">
    {@render controls?.()}
  </div>

  <!--
    The failures and the notices of the view on screen. They are said out
    loud here, over the picture: a failure never leaves a blank canvas.
  -->
  <div class="px-3 pb-3 empty:pb-0">
    {@render status?.()}
  </div>

  <!--
    The description of the list is rendered by the page: it lives next to
    the picture, and the toggle points at it.
  -->
</FloatingPanel>
