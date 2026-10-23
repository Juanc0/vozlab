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
  <!--
    One row, centred as a set: the title to the left, and **to its right**
    every control and action of the view. A toolbar whose parts fly to the
    corners is a toolbar nobody scans; controls that stay together are
    scanned in one pass.
  -->
  <div class="flex flex-wrap items-start justify-center gap-x-6 gap-y-2 px-3 py-3">
    <!--
      The title of the screen. It is the one element of the interface that
      is set in the serif, and it is the first thing the reader sees when
      the workspace opens.
    -->
    <h1 class="text-kpi self-center">{t('graph.heading')}</h1>

    <div class="flex flex-wrap items-end justify-center gap-x-6 gap-y-2">
      {@render controls?.()}

      <!--
        The one filled button of the interface: it creates a node, and it
        is the only action of the screen that is painted with the accent.
      -->
      <div class="pb-0.5">
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
