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
  import { comparisonGraph, MAX_NODES, type ComparisonGraph } from './comparison-data';
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

  /** The id of the folded note of the comparison. */
  const essayId = `engine-essay-${uid}`;

  /** The window of the workspace — the picture the engine draws. */
  let windowNodes = $state.raw<NodeDto[]>([]);
  let windowEdges = $state.raw<SubgraphEdgeDto[]>([]);
  let loading = $state(false);
  let failure = $state<ApiFailure | null>(null);

  /** How many nodes the picture holds. */
  let wanted = $state(0);

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

  /** The note of the comparison — onboarding, folded by default. */
  let essayOpen = $state(false);

  /**
   * The full measurements of the engine — one fold for the whole surface.
   *
   * It lives here and not in the readout, so it is the **same** fold when the
   * reader moves from one engine to the next: the comparison keeps the state
   * it was left in.
   */
  let measurementsOpen = $state(false);

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

      // The select shows the window that came: the old fixed default is not
      // one of its options when the workspace is larger (or smaller), and a
      // select whose value matches no option is a blank field.
      wanted = Math.min(answer.nodes.length, MAX_NODES);
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

  /**
   * The sizes the picture can take.
   *
   * The window that came is **always** an option, even when its size is not
   * one of the old presets: a select whose value matches no option renders
   * blank, and a blank field does not say what the picture is. The current
   * size is added as a last resort, so the select never loses its value.
   */
  const sizeOptions = $derived.by<{ value: number; label: string }[]>(() => {
    const options = new Map<number, string>();

    options.set(
      demoCount,
      t('engines.sizeDemo', { count: formatNumber(locale.locale, demoCount) })
    );

    if (demoCount !== MAX_NODES) {
      options.set(
        MAX_NODES,
        t('engines.sizeStress', { count: formatNumber(locale.locale, MAX_NODES) })
      );
    }

    if (!options.has(wanted)) {
      options.set(
        wanted,
        t('engines.sizeCurrent', { count: formatNumber(locale.locale, wanted) })
      );
    }

    return [...options.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, label]) => ({ value, label }));
  });
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
    The **floating toolbar**: the frame of the picture. It is one compact
    bar — the title, the tabs and one row of controls — and it is **flat**:
    a surface over the ground is already the tone step, and a shadow here
    would turn the bar into a card over the picture.

    The note of the comparison is onboarding, and whoever opens the
    comparison is there to look at pictures: it is folded behind a quiet
    control and starts folded.
  -->
  <FloatingPanel
    placement="top-left"
    label={t('engines.toolbarLabel')}
    panelClass="max-w-[calc(100%-2rem)]"
    flat
    bind:element={toolbarElement}
  >
    <div class="p-3 max-sm:p-2">
      <div class="flex items-center gap-2 sm:gap-3">
        <h1 class="min-w-0 flex-1 truncate text-kpi max-sm:text-body">
          {t('engines.heading')}
        </h1>

        <!--
          The note of the comparison, one click away. It starts folded: the
          paragraph is onboarding, and the picture is what the reader came
          for. On a phone the control is the question mark; the accessible
          name is always the same.
        -->
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-raised hover:text-text sm:inline-flex sm:size-auto sm:h-8 sm:gap-1.5 sm:px-2.5"
          aria-expanded={essayOpen}
          aria-controls={essayId}
          data-testid="essay-toggle"
          onclick={() => {
            essayOpen = !essayOpen;
          }}
        >
          <span aria-hidden="true" class="text-body font-semibold sm:hidden">?</span>
          <span class="sr-only sm:not-sr-only">{t('engines.essayToggle')}</span>
          <svg
            aria-hidden="true"
            class="hidden size-4 shrink-0 transition-transform motion-reduce:transition-none sm:block {essayOpen
              ? 'rotate-180'
              : ''}"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>

        <!--
          The switch between the picture and its **text alternative**. It is
          a real toggle: the state is announced (`aria-pressed`), and the
          list is one click away — never behind a hover or a gesture.
        -->
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-control border border-control bg-surface text-text hover:bg-raised sm:inline-flex sm:size-auto sm:h-8 sm:gap-1.5 sm:px-2.5 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-ink"
          aria-pressed={listOpen}
          data-testid="list-toggle"
          onclick={() => {
            listOpen = !listOpen;
          }}
        >
          <svg
            aria-hidden="true"
            class="size-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
          </svg>
          <span class="sr-only sm:not-sr-only">{t('engines.listToggle')}</span>
        </button>
      </div>

      <!--
        The note: folded, and it stays in the document while it is closed so
        the control always points at the same paragraph.
      -->
      <div id={essayId} hidden={!essayOpen} class="mt-2">
        <p class="max-w-measure text-small text-muted sm:text-body">
          {t('engines.intro')}
        </p>
      </div>

      <!--
        The tabs of the engines: the quiet control that chooses the
        implementation that occupies the space.

        The layered arrangements do not breathe: their ranks are the picture,
        and there is nothing to wake. The comparison says so out loud, on the
        same row on a wide screen, so the still picture is not read as a
        broken spring and the bar does not grow a line of its own.
      -->
      <div class="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <EngineTabs
          active={activeEngine}
          onselect={selectEngine}
          {panelId}
          {tabId}
        />

        {#if descriptor.layout === 'dagre' || descriptor.layout === 'dag'}
          <p
            role="note"
            data-testid="hierarchy-note"
            class="text-small text-muted sm:justify-self-end"
          >
            {t('engines.hierarchyStatic')}
          </p>
        {/if}
      </div>

      <!--
        The controls over the picture: the size of the picture, the shape of
        the relations, the measurement of the engine that is on screen, the
        repetition of its arrangement and the counts of the picture.
      -->
      <div class="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <label for="engines-size" class="block text-small text-muted">
            {t('engines.sizeLabel')}
          </label>
          <select
            id="engines-size"
            class="field mt-0.5"
            bind:value={wanted}
          >
            {#each sizeOptions as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
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

        <!--
          The counts of the picture: the same nodes and the same relations
          for every engine. They sit at the end of the row, in the meta ink:
          a number, not another paragraph.
        -->
        <p class="self-center text-small text-muted sm:ml-auto">
          {t('engines.counts', { nodes: nodeCount, edges: edgeCount })}
        </p>
      </div>
    </div>
  </FloatingPanel>

  <!--
    The **readout of the engine**: what was measured on the engine that is
    on screen. It floats over the picture, at the other end of it from the
    toolbar — the same rhythm the graph page has.
  -->
  <FloatingPanel
    placement="bottom-left"
    label={t('engines.readoutLabel')}
    panelClass="max-h-[40vh] w-[min(28rem,calc(100%-2rem))] overflow-y-auto min-[48rem]:max-h-[calc(100%-var(--notice-h,0px)-18rem)]"
    flat
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
        bind:open={measurementsOpen}
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
