<script lang="ts">
  /**
   * The **comparison of the engines** — one workspace, one engine at a time.
   *
   * The comparison is a **playground**: the frame is the frame of the graph
   * page — the canvas fills the workspace on the even ground, the toolbar
   * floats at the top over it, the other panels float over it and the page
   * does not scroll — and the engines are the **tabs** of that space. They
   * are not side by side: choosing one mounts it in the same space, and the
   * one that was there is unmounted and gives its canvas back.
   *
   * The comparison gives every engine the same **data** (the same window,
   * the same nodes, the same relations), the same **card** and the same
   * **controls** over the picture (the size of the picture, the shape of
   * the relations) — and it gets out of the way: the arrangement, the
   * painter and the interactions are the engine's own.
   *
   * The **readout** belongs to the engine that is on screen: the time it
   * took to settle, the pairs of cards that lie on top of each other,
   * whether the same picture comes out twice and the relations the
   * arrangement had to break are measured **on that engine**.
   *
   * The surface is **development only**: it is rendered only in a
   * development build, and the code behind it is imported dynamically so it
   * never reaches the bundle of the app.
   */
  import { onMount, untrack } from 'svelte';
  import { loadNodeWindow } from '$lib/api/graph';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import FloatingPanel from '$lib/components/FloatingPanel.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import { comparisonGraph, type ComparisonGraph } from './comparison-data';
  import { measureFrames, summarizeFrames, type FrameSummary } from './frames';
  import { engineDescriptor, type EngineId, type EngineMeasurement } from './engines';
  import EnginePanel from './EnginePanel.svelte';
  import EngineReadout from './EngineReadout.svelte';
  import EngineTabs from './EngineTabs.svelte';

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /** The shapes the relations are drawn with, in the order the control shows them. */
  const EDGE_STYLES: readonly EdgeStyle[] = [
    'straight',
    'bezier',
    'unbundled',
    'arc',
    'haystack'
  ];

  /** The label of every shape, in the dictionary. */
  const EDGE_STYLE_LABELS: Record<EdgeStyle, string> = {
    straight: t('explore.edgeStraight'),
    bezier: t('explore.edgeBezier'),
    unbundled: t('explore.edgeUnbundled'),
    arc: t('explore.edgeArc'),
    haystack: t('explore.edgeHaystack')
  };

  /** The ids of the tabs and of the panel cannot be fixed. */
  const uid = $props.id();

  /** The id of the panel the tabs control — the space of the picture. */
  const panelId = `engine-panel-${uid}`;

  /** The id of the tab of an engine. */
  function tabId(engine: EngineId): string {
    return `engine-tab-${engine}-${uid}`;
  }

  /** The window of the workspace — the picture the engine draws. */
  let windowNodes = $state.raw<NodeDto[]>([]);
  let windowEdges = $state.raw<SubgraphEdgeDto[]>([]);
  let loading = $state(false);
  let failure = $state<ApiFailure | null>(null);

  /** How many nodes the picture holds. */
  let wanted = $state(24);

  /** The shape the relations are drawn with. */
  let edgeStyle = $state<EdgeStyle>('bezier');

  /** The nodes that are drawn with their whole content. */
  let expandedIds = $state.raw<Set<string>>(new Set<string>());

  /** The selected node. */
  let selectedNodeId = $state<string | null>(null);

  /** The token that asks the engine to arrange the picture again. */
  let layoutToken = $state(0);

  /** The list — the text alternative of the picture. */
  let listOpen = $state(false);

  /** The engine that is on screen. */
  let activeEngine = $state<EngineId>('dagre');

  /** The measurements of the frame time, by engine. */
  let frames = $state.raw<Map<EngineId, FrameSummary>>(new Map());

  /** What the engines reported about their arrangement, by engine. */
  let layouts = $state.raw<Map<EngineId, EngineMeasurement>>(new Map());

  /** Whether the measurement is running. */
  let measuring = $state(false);

  /** The element the engine draws in — the measurement is taken on it. */
  let canvasElement = $state.raw<HTMLElement | undefined>(undefined);

  /** The failure of the engine, if it could not be drawn. */
  let panelFailure = $state<string | null>(null);

  /** The height of the floating toolbar. */
  let toolbarHeight = $state(0);

  /** The element of the floating toolbar. */
  let toolbarElement: HTMLElement | undefined = $state();

  /**
   * The height of the toolbar is told to the page.
   *
   * The list is the other half of the workspace and it must not run under
   * the toolbar: the panel is measured, and the list starts below it.
   */
  $effect(() => {
    const element = toolbarElement;

    if (element === undefined) {
      return;
    }

    const report = (): void => {
      toolbarHeight = element.offsetHeight;
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

  /** The picture the engine draws. */
  const picture = $derived.by<ComparisonGraph>(() =>
    comparisonGraph({ nodes: windowNodes, edges: windowEdges }, wanted)
  );

  /**
   * The nodes the engine is given.
   *
   * The array is a **new** one when the layout is asked again: the engine
   * arranges the picture again when its data changes, and the engine itself
   * is not re-created — the places the user dragged the nodes to survive.
   */
  const panelNodes = $derived.by<NodeDto[]>(() => {
    void layoutToken;

    return [...picture.nodes];
  });

  /** The relations the engine is given. */
  const panelEdges = $derived.by<SubgraphEdgeDto[]>(() => {
    void layoutToken;

    return [...picture.edges];
  });

  /** The demo — the window as the API answered it. */
  const demoCount = $derived(windowNodes.length);

  /** The id of the node the view presents: the first one of the picture. */
  const presented = $derived(picture.nodes[0]?.id ?? null);

  /** The engine that is on screen, as a descriptor. */
  const descriptor = $derived(engineDescriptor(activeEngine));

  /** The measurement of the engine that is on screen. */
  const measurement = $derived(layouts.get(activeEngine));

  /** The frame times of the engine that is on screen. */
  const engineFrames = $derived(frames.get(activeEngine));

  onMount(() => {
    void load();
  });

  /** Reads the window of the workspace. */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;

    if (workspaceId === '') {
      return;
    }

    void load();
  });

  /** Reads the window of the workspace. */
  async function load(): Promise<void> {
    loading = true;
    failure = null;

    try {
      const answer = await loadNodeWindow(api, { limit: 200 });

      windowNodes = answer.nodes;
      windowEdges = answer.edges;
    } catch (caught) {
      failure = describeFailure(caught, t);
    } finally {
      loading = false;
    }
  }

  /** The user expanded or collapsed a node. */
  function toggleNode(nodeId: string): void {
    const next = new Set(expandedIds);

    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }

    expandedIds = next;
  }

  /**
   * Forgets the measurements of an engine.
   *
   * The measurements belong to the picture they were taken on: an engine
   * that is mounted again is a **new** picture, and the numbers of the old
   * one are not its numbers.
   *
   * @param engine - The engine whose measurements are forgotten.
   */
  function forgetMeasurements(engine: EngineId): void {
    if (frames.has(engine)) {
      const next = new Map(frames);
      next.delete(engine);
      frames = next;
    }

    if (layouts.has(engine)) {
      const next = new Map(layouts);
      next.delete(engine);
      layouts = next;
    }
  }

  /**
   * Shows another engine.
   *
   * The engine that was on screen is unmounted and its canvas is released;
   * the new one is mounted in the same space. The measurements of both are
   * forgotten: they belong to a picture that is no longer on screen.
   *
   * @param engine - The engine the reader picked.
   */
  function selectEngine(engine: EngineId): void {
    if (engine === activeEngine) {
      return;
    }

    const previous = activeEngine;

    activeEngine = engine;
    panelFailure = null;

    forgetMeasurements(previous);
    forgetMeasurements(engine);
  }

  /**
   * Keeps the report of an arrangement.
   *
   * The report arrives **inside** the effect of the canvas that ran the
   * layout: writing the state of the page from there is not allowed, and
   * the write is put in the queue of the microtasks — the page reads the
   * report on the next turn of the event loop.
   *
   * The report is stored **under the engine that produced it**: the engine
   * that was on screen when the report arrived may be another one.
   *
   * @param engine - The engine that ran the arrangement.
   * @param report - What the engine reported.
   */
  function reportLayout(engine: EngineId, report: EngineMeasurement): void {
    queueMicrotask(() => {
      layouts.set(engine, report);
      layouts = new Map(layouts);
    });
  }

  /**
   * Measures the frame time of the engine that is on screen.
   *
   * Only one engine is mounted, so the picture that is measured is the
   * picture of that engine — and the frame that is measured belongs to it.
   */
  async function measure(): Promise<void> {
    const element = canvasElement;
    const engine = activeEngine;

    if (element === undefined) {
      return;
    }

    measuring = true;

    try {
      const summary = summarizeFrames(await measureFrames(element));

      frames.set(engine, summary);
      frames = new Map(frames);
    } finally {
      measuring = false;
    }
  }

  /**
   * The measure belongs to the picture it was taken on.
   *
   * When the picture changes, the measure of the old picture is not the
   * measure of the new one: it is dropped.
   */
  $effect(() => {
    // The effect reads the size of the picture so it runs when it changes.
    void wanted;
    void picture.nodes.length;

    untrack(() => {
      frames = new Map();
      layouts = new Map();
    });
  });

  /** The number of nodes of the picture, written with the conventions of the locale. */
  const nodeCount = $derived(formatNumber(locale.locale, picture.nodes.length));
  const edgeCount = $derived(formatNumber(locale.locale, picture.edges.length));
</script>

<svelte:head>
  <title>{t('engines.pageTitle')}</title>
</svelte:head>

<!--
  The **workspace**: the window is the page.

  The picture is the whole area, on the even ground, and the panels float
  over it — the toolbar at the top and the readout of the engine at the
  bottom left. The page does not scroll: it is the same frame the graph
  page has.
-->
<div class="relative h-full w-full overflow-hidden bg-ground">
  <!--
    The picture — or the list, which is its **text alternative**. They
    share the same area: the toggle of the toolbar swaps them, and both
    carry the same picture and the same selection.

    The picture stays in the document when the list is on screen: the
    engine keeps the place the reader left it.
  -->
  <div
    class="absolute inset-0"
    class:invisible={listOpen}
    aria-hidden={listOpen ? 'true' : undefined}
    inert={listOpen}
  >
    <!--
      The panel of the tabs: the space of the picture. It is the panel the
      tabs control, and it is labelled by the tab that is on screen.
    -->
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId(activeEngine)}
      tabindex="0"
      class="h-full w-full"
    >
      <EnginePanel
        engine={activeEngine}
        nodes={panelNodes}
        edges={panelEdges}
        {expandedIds}
        {selectedNodeId}
        presentedNodeId={presented}
        {edgeStyle}
        label={`${t(descriptor.nameKey)} — ${t('engines.pictureLabel')}`}
        onselect={(nodeId) => {
          selectedNodeId = nodeId;
        }}
        ontoggle={toggleNode}
        onlayout={reportLayout}
        onerror={(message) => {
          panelFailure = message;
        }}
        oncontainer={(element) => {
          canvasElement = element;
        }}
      />
    </div>
  </div>

  <!--
    The list: the text alternative of the picture, in the same area. It is
    a real DOM list and it scrolls inside itself — never the page.

    It starts **below the toolbar**: a list that runs under a floating
    panel is a list the reader cannot click.
  -->
  {#if listOpen}
    <div
      class="absolute inset-0 overflow-y-auto bg-ground pl-4"
      style="padding-top: {toolbarHeight + 32}px; padding-right: 1rem; padding-bottom: calc(var(--notice-h, 0px) + 1rem)"
    >
      <GraphListView
        summaryKey="explore.listSummary"
        nodes={picture.nodes}
        edges={picture.edges}
        selection={selectedNodeId === null ? null : { kind: 'node', id: selectedNodeId }}
        onselect={(selection) => {
          selectedNodeId = selection?.kind === 'node' ? selection.id : null;
        }}
      />
    </div>
  {/if}

  <!--
    The **floating toolbar**: the frame of the picture. It holds the title,
    the tabs of the engines and the controls over the picture.
  -->
  <FloatingPanel
    placement="top-left"
    label={t('engines.toolbarLabel')}
    panelClass="max-w-[calc(100%-2rem)]"
    bind:element={toolbarElement}
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <h1 class="text-kpi">{t('engines.heading')}</h1>

      <!--
        The switch between the picture and its **text alternative**. It is
        a real toggle: the state is announced (`aria-pressed`), and the
        list is one click away — never behind a hover or a gesture.
      -->
      <button
        type="button"
        class="btn btn-secondary ml-auto aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-ink"
        aria-pressed={listOpen}
        onclick={() => {
          listOpen = !listOpen;
        }}
      >
        {t('engines.listToggle')}
      </button>
    </div>

    <!--
      The note of the comparison. On a narrow screen the picture is the
      thing: the note goes.
    -->
    <p class="hidden max-w-measure px-3 text-small text-muted min-[48rem]:block">
      {t('engines.intro')}
    </p>

    <!--
      The tabs of the engines: the quiet control that chooses the
      implementation that occupies the space.
    -->
    <div class="px-3 pt-2">
      <EngineTabs
        active={activeEngine}
        onselect={selectEngine}
        {panelId}
        {tabId}
      />
    </div>

    <!--
      The layered arrangements do not breathe: their ranks are the picture,
      and there is nothing to wake. The comparison says so out loud, so the
      still picture is not read as a broken spring.
    -->
    {#if descriptor.layout === 'dagre' || descriptor.layout === 'dag'}
      <p
        role="note"
        data-testid="hierarchy-note"
        class="max-w-measure px-3 pt-2 text-small text-muted"
      >
        {t('engines.hierarchyStatic')}
      </p>
    {/if}

    <!--
      The controls over the picture: the size of the picture, the shape of
      the relations, the measurement of the engine that is on screen and the
      repetition of its arrangement.
    -->
    <div class="flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-3">
      <div>
        <label for="engines-size" class="block text-small text-muted">
          {t('engines.sizeLabel')}
        </label>
        <select
          id="engines-size"
          class="field mt-0.5"
          value={wanted}
          onchange={(event) => {
            const select = event.currentTarget;

            if (select instanceof HTMLSelectElement) {
              wanted = Number(select.value);
            }
          }}
        >
          <option value={demoCount}>
            {t('engines.sizeDemo', { count: formatNumber(locale.locale, demoCount) })}
          </option>
          <option value={200}>
            {t('engines.sizeStress', { count: formatNumber(locale.locale, 200) })}
          </option>
        </select>
      </div>

      <div>
        <label for="engines-edge-style" class="block text-small text-muted">
          {t('engines.edgeStyleLabel')}
        </label>
        <select
          id="engines-edge-style"
          class="field mt-0.5"
          value={edgeStyle}
          onchange={(event) => {
            const select = event.currentTarget;

            if (select instanceof HTMLSelectElement) {
              edgeStyle = select.value as EdgeStyle;
            }
          }}
        >
          {#each EDGE_STYLES as style (style)}
            <option value={style}>{EDGE_STYLE_LABELS[style]}</option>
          {/each}
        </select>
      </div>

      <button type="button" class="btn btn-secondary" onclick={measure} disabled={measuring}>
        {measuring ? t('engines.measuring') : t('engines.measure')}
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => {
          layoutToken += 1;
        }}
      >
        {t('engines.rerun')}
      </button>
    </div>

    <!--
      The counts of the picture: the same nodes and the same relations for
      every engine.
    -->
    <p class="px-3 pb-3 text-small text-muted">
      {t('engines.counts', { nodes: nodeCount, edges: edgeCount })}
    </p>
  </FloatingPanel>

  <!--
    The **readout of the engine**: what was measured on the engine that is
    on screen. It floats over the picture, at the other end of it from the
    toolbar — the same rhythm the graph page has.
  -->
  <FloatingPanel
    placement="bottom-left"
    label={t('engines.readoutLabel')}
    panelClass="max-h-[40vh] w-[min(26rem,calc(100%-2rem))] overflow-y-auto min-[48rem]:max-h-[calc(100%-var(--notice-h,0px)-18rem)]"
  >
    {#if failure !== null}
      <p
        role="alert"
        class="m-3 rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
      >
        <span class="font-mono">{failure.code}</span> — {failure.message}
      </p>
    {:else if loading && picture.nodes.length === 0}
      <p role="status" class="p-3 text-body text-muted">{t('engines.loading')}</p>
    {:else if picture.nodes.length === 0}
      <p class="p-3 text-body text-muted">{t('engines.empty')}</p>
    {:else}
      <EngineReadout
        engine={descriptor}
        {measurement}
        frames={engineFrames}
        nodes={picture.nodes}
        edges={picture.edges}
      />
    {/if}

    <!--
      An engine that could not draw the picture says what happened: the
      reader is told instead of facing a blank space.
    -->
    {#if panelFailure !== null}
      <p
        role="alert"
        class="m-3 rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
      >
        {panelFailure}
      </p>
    {/if}
  </FloatingPanel>
</div>
