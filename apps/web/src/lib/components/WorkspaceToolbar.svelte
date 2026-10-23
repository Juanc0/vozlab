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
  import FloatingPanel from '$lib/components/FloatingPanel.svelte';
  import { getLocaleState } from '$lib/state/context';

  /** The two views of the graph. */
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
    /** The id of the description of the list — it says what the alternative is. */
    listDescriptionId: string;
    /** The extra classes of the panel — its width. */
    panelClass?: string;
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
    /** The readouts of the view on screen. */
    readout?: Snippet;
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
    listDescriptionId,
    panelClass = '',
    onheight,
    controls,
    status,
    readout
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
  placement="top"
  label={t('graph.toolbarLabel')}
  panelClass="w-full {panelClass}"
>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
    <!--
      The title of the screen. It is the one element of the interface that
      is set in the serif, and it is the first thing the reader sees when
      the workspace opens.
    -->
    <h1 class="text-kpi">{t('graph.heading')}</h1>

    <div class="ml-auto flex items-center gap-2">
      <!--
        The one filled button of the interface: it creates a node, and it
        is the only action of the screen that is painted with the accent.
      -->
      <button
        type="button"
        class="btn btn-primary"
        disabled={newNodeDisabled}
        onclick={onnewnode}
      >
        {t('graph.newNode')}
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
    The readouts of the view on screen: what the picture is and what it is
    not.
  -->
  <div class="px-3 pb-3">
    {@render readout?.()}
  </div>

  <!--
    The description of the list is rendered by the page: it lives next to
    the picture, and the toggle points at it.
  -->
</FloatingPanel>
