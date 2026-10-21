<script lang="ts">
  /**
   * The **comparison of the engines** — the same picture in three of them.
   *
   * The three panels get the **same** data (the same ids, the same nodes,
   * the same relations) and the same interactions: pan, zoom, the hover
   * preview, the badge that expands a node and the drag. What changes is
   * the engine:
   *
   * - **Cytoscape + dagre**: the incumbent. A deterministic, hierarchical
   *   arrangement.
   * - **Cytoscape + fcose**: the same canvas with the **force** layout — a
   *   spring that settles and stops.
   * - **Sigma.js + Graphology**: the WebGL renderer with the graph in the
   *   client, arranged by the ForceAtlas2 layout of Graphology.
   *
   * The surface is **development only**: it is rendered only in a
   * development build, and the code behind it is imported dynamically so
   * it never reaches the bundle of the app.
   */
  import { onMount, untrack } from 'svelte';
  import { loadNodeWindow } from '$lib/api/graph';
  import type { ApiFailure } from '$lib/api/failure';
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import { describeFailure } from '$lib/api/failure';
  import ExplorationCanvas from '$lib/components/ExplorationCanvas.svelte';
  import GraphListView from '$lib/components/GraphListView.svelte';
  import type { EdgeStyle } from '$lib/graph/explore/edge-style';
  import { formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';
  import SigmaPanel from './SigmaPanel.svelte';
  import { comparisonGraph, type ComparisonGraph } from './comparison-data';
  import { registerForceLayout } from './fcose';
  import { measureFrames, summarizeFrames, type FrameSummary } from './frames';

  // The force layout of Cytoscape is registered **before** anything is
  // drawn: the extension is a global registration, and the picture must
  // never ask for a layout that does not exist.
  registerForceLayout();

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

  /** The window of the workspace — the picture the panels draw. */
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

  /** The node the view presents. */
  let presentedNodeId = $state<string | null>(null);

  /** The token that asks the three panels to arrange the picture again. */
  let layoutToken = $state(0);

  /** The list — the text alternative of the three pictures. */
  let listOpen = $state(false);

  /** The measurements of the three engines. */
  let frames = $state.raw<Map<string, FrameSummary>>(new Map());

  /** The instants the layouts took, by engine. */
  let layouts = $state.raw<
    Map<string, { ms: number; settled: boolean; iterations?: number; overlaps?: number; ticks?: number; frameMs?: number }>
  >(new Map());

  /** Whether the measurement is running. */
  let measuring = $state(false);

  /**
   * The failure of a panel, if it could not be drawn.
   *
   * A browser without WebGL leaves the panel of Sigma empty: the reader
   * is told what happened instead of facing a blank space.
   */
  let panelFailure = $state<string | null>(null);

  /** The containers of the three panels, for the measurement. */
  const panelElements = new Map<string, HTMLElement>();

  /**
   * Keeps the element of a panel, for the measurement.
   *
   * It is an **action**: the panels live in a list, and the measurement
   * needs the element of each one of them.
   */
  function capture(node: HTMLElement, id: string): { destroy: () => void } {
    panelElements.set(id, node);

    return {
      destroy(): void {
        panelElements.delete(id);
      }
    };
  }

  /** The picture the three panels draw. */
  const picture = $derived.by<ComparisonGraph>(() =>
    comparisonGraph({ nodes: windowNodes, edges: windowEdges }, wanted)
  );

  /**
   * The nodes the panels are given.
   *
   * The array is a **new** one when the layout is asked again: the panels
   * arrange the picture again when their data changes, and the panels
   * themselves are not re-created — the places the user dragged the nodes
   * to survive.
   */
  const panelNodes = $derived.by<NodeDto[]>(() => {
    void layoutToken;

    return [...picture.nodes];
  });

  /** The relations the panels are given. */
  const panelEdges = $derived.by<SubgraphEdgeDto[]>(() => {
    void layoutToken;

    return [...picture.edges];
  });

  /** The demo — the window as the API answered it. */
  const demoCount = $derived(windowNodes.length);

  /** The id of the node the view presents: the first one of the picture. */
  const presented = $derived(picture.nodes[0]?.id ?? null);

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

  /** The panel of an engine, for the measurement. */
  function panelOf(name: string): HTMLElement | undefined {
    return panelElements.get(name);
  }

  /**
   * Keeps the report of a layout.
   *
   * The report arrives **inside** the effect of the canvas that ran the
   * layout: writing the state of the page from there is not allowed, and
   * the write is put in the queue of the microtasks — the page reads the
   * report on the next turn of the event loop.
   */
  function reportLayout(
    engine: string,
    report: {
      ms: number;
      settled: boolean;
      iterations?: number;
      overlaps?: number;
      ticks?: number;
      frameMs?: number;
    }
  ): void {
    queueMicrotask(() => {
      layouts.set(engine, report);
      layouts = new Map(layouts);
    });
  }

  /**
   * Measures the frame time of the three engines.
   *
   * The three panels are measured **one after the other**: the picture
   * that is being measured is the only one that moves, so the frame that
   * is measured is the frame of that engine.
   */
  async function measure(): Promise<void> {
    measuring = true;
    const next = new Map<string, FrameSummary>();

    try {
      for (const name of ['dagre', 'd3', 'fcose', 'sigma']) {
        const element = panelOf(name);

        if (element === undefined) {
          continue;
        }

        const summary = summarizeFrames(await measureFrames(element));
        next.set(name, summary);
      }
    } finally {
      frames = next;
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
    });
  });

  /** The number of nodes of the picture, written with the conventions of the locale. */
  const nodeCount = $derived(formatNumber(locale.locale, picture.nodes.length));
  const edgeCount = $derived(formatNumber(locale.locale, picture.edges.length));
</script>

<div class="mx-auto max-w-[90rem] space-y-6 px-4 py-6">
  <header class="space-y-2">
    <h1 class="text-section font-sans">{t('engines.heading')}</h1>
    <p class="max-w-measure text-body text-muted">{t('engines.intro')}</p>
  </header>

  <!--
    The controls of the comparison: the size of the picture, the shape of
    the relations, the measurement and the repetition of the layout.
  -->
  <section class="rounded-card bg-surface p-4">
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
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
          <option value={demoCount}>{t('engines.sizeDemo', { count: formatNumber(locale.locale, demoCount) })}</option>
          <option value={200}>{t('engines.sizeStress', { count: formatNumber(locale.locale, 200) })}</option>
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

      <button
        type="button"
        class="btn btn-secondary"
        aria-expanded={listOpen}
        onclick={() => {
          listOpen = !listOpen;
        }}
      >
        {t('engines.listToggle')}
      </button>
    </div>

    <p class="mt-3 text-small text-muted">
      {t('engines.counts', { nodes: nodeCount, edges: edgeCount })}
    </p>
  </section>

  {#if failure !== null}
    <p
      role="alert"
      class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink"
    >
      <span class="font-mono">{failure.code}</span> — {failure.message}
    </p>
  {:else if loading && picture.nodes.length === 0}
    <p role="status" class="text-body text-muted">{t('engines.loading')}</p>
  {:else if picture.nodes.length === 0}
    <p class="text-body text-muted">{t('engines.empty')}</p>
  {:else}
    <!--
      The three panels, side by side. They are the same picture in three
      engines: the same nodes, the same relations and the same controls.
    -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {#each [{ id: 'dagre', name: t('engines.panelDagreName'), note: t('engines.panelDagreNote'), reproducible: t('engines.reproducibleDagre') }, { id: 'd3', name: t('engines.panelD3Name'), note: t('engines.panelD3Note'), reproducible: t('engines.reproducibleD3') }, { id: 'fcose', name: t('engines.panelFcoseName'), note: t('engines.panelFcoseNote'), reproducible: t('engines.reproducibleFcose') }, { id: 'sigma', name: t('engines.panelSigmaName'), note: t('engines.panelSigmaNote'), reproducible: t('engines.reproducibleSigma') }] as panel (panel.id)}
        <section class="flex flex-col rounded-card bg-surface p-3">
          <h2 class="text-body font-semibold">{panel.name}</h2>
          <p class="mt-0.5 text-small text-muted">{panel.note}</p>

          <!--
            The readouts of the engine: the frame, the layout and whether
            the picture has settled.
          -->
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-small">
            <dt class="text-muted">{t('engines.frameLabel')}</dt>
            <dd class="font-mono">
              {#if frames.get(panel.id) === undefined}
                —
              {:else}
                {t('engines.frameValue', {
                  value: frames.get(panel.id)?.median.toFixed(2) ?? '—'
                })}
                <span class="text-muted">
                  {t('engines.framePeak', {
                    value: frames.get(panel.id)?.max.toFixed(2) ?? '—'
                  })}
                </span>
                <span class="text-muted">
                  {t('engines.frameCount', {
                    count: formatNumber(locale.locale, frames.get(panel.id)?.frames ?? 0)
                  })}
                </span>
              {/if}
            </dd>

            <dt class="text-muted">{t('engines.layoutLabel')}</dt>
            <dd class="font-mono">
              {layouts.get(panel.id) === undefined
                ? '—'
                : t('engines.layoutValue', {
                    value: (layouts.get(panel.id)?.ms ?? 0).toFixed(1)
                  })}
            </dd>

            <dt class="text-muted">{t('engines.settledLabel')}</dt>
            <dd>
              {layouts.get(panel.id) === undefined
                ? '—'
                : layouts.get(panel.id)?.settled === true
                  ? t('engines.settledYes')
                  : t('engines.settledNo')}
            </dd>

            <!--
              The pairs of cards that lie on top of each other: the metric
              that told the truth about the springs.
            -->
            <dt class="text-muted">{t('engines.overlapsLabel')}</dt>
            <dd class="font-mono">
              {layouts.get(panel.id)?.overlaps === undefined
                ? '—'
                : t('engines.overlapsValue', {
                    count: formatNumber(locale.locale, layouts.get(panel.id)?.overlaps ?? 0)
                  })}
            </dd>

            <!--
              The steps of the simulation and the time a frame of it took:
              the spring is run in slices, and the slices are what the
              reader sees.
            -->
            <dt class="text-muted">{t('engines.ticksLabel')}</dt>
            <dd class="font-mono">
              {layouts.get(panel.id)?.ticks === undefined
                ? '—'
                : t('engines.ticksValue', {
                    count: formatNumber(locale.locale, layouts.get(panel.id)?.ticks ?? 0)
                  })}
            </dd>

            <dt class="text-muted">{t('engines.layoutFrameLabel')}</dt>
            <dd class="font-mono">
              {layouts.get(panel.id)?.frameMs === undefined
                ? '—'
                : t('engines.frameLayoutValue', {
                    value: (layouts.get(panel.id)?.frameMs ?? 0).toFixed(2)
                  })}
            </dd>

            <!--
              Whether the same picture comes out twice. It is not the same
              question for the four engines, and the answer says so.
            -->
            <dt class="text-muted">{t('engines.reproducibleLabel')}</dt>
            <dd>{panel.reproducible}</dd>
          </dl>

          <!--
            The picture of the engine. The three panels are measured one
            after the other, and the container of each one is kept.
          -->
          <div
            use:capture={panel.id}
            class="mt-3 h-[26rem] overflow-hidden rounded-control border border-rule bg-ground"
          >
            {#if panel.id === 'sigma' && panelFailure !== null}
              <p
                role="alert"
                class="grid h-full place-items-center p-4 text-center text-small text-pill-negative-ink"
              >
                {panelFailure}
              </p>
            {:else if panel.id === 'sigma'}
              <SigmaPanel
                nodes={panelNodes}
                edges={panelEdges}
                {expandedIds}
                {selectedNodeId}
                presentedNodeId={presented}
                {edgeStyle}
                readableScale={0.08}
                label={`${panel.name} — ${t('engines.canvasLabel')}`}
                onselect={(id) => {
                  selectedNodeId = id;
                }}
                ontoggle={toggleNode}
                onsettled={(report) => {
                  reportLayout('sigma', {
                    ms: report.ms,
                    settled: true,
                    iterations: report.iterations,
                    overlaps: report.overlaps
                  });
                }}
                onerror={(message) => {
                  panelFailure = message;
                }}
              />
            {:else}
              <ExplorationCanvas
                nodes={panelNodes}
                edges={panelEdges}
                {expandedIds}
                {selectedNodeId}
                presentedNodeId={presented}
                {edgeStyle}
                layout={panel.id === 'fcose' ? 'fcose' : panel.id === 'd3' ? 'd3' : 'dagre'}
                readableZoom={0.08}
                label={`${panel.name} — ${t('engines.canvasLabel')}`}
                onselect={(id) => {
                  selectedNodeId = id;
                }}
                ontoggle={toggleNode}
                onlayout={(report) => {
                  reportLayout(panel.id, {
                    ms: report.ms,
                    settled: report.settled,
                    overlaps: report.overlaps,
                    ticks: report.ticks,
                    frameMs: report.frameMs
                  });
                }}
              />
            {/if}
          </div>
        </section>
      {/each}
    </div>

    <!--
      The findings of the comparison: what the other two engines cannot do.
    -->
    <section class="rounded-card bg-surface p-4">
      <h2 class="text-body font-semibold">{t('engines.findingsHeading')}</h2>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-small text-muted">
        <li>{t('engines.findingSigmaLabel')}</li>
        <li>{t('engines.findingSigmaEdges')}</li>
        <li>{t('engines.findingSigmaDashes')}</li>
        <li>{t('engines.findingFcoseSeed')}</li>
        <li>{t('engines.findingD3Collision')}</li>
        <li>{t('engines.findingD3Seed')}</li>
      </ul>
    </section>

    <!--
      The list: the **text alternative** of the three pictures. A canvas is
      a picture a screen reader cannot see, and the list is the real
      alternative — one click away.
    -->
    {#if listOpen}
      <section class="rounded-card bg-surface p-4">
        <h2 class="text-body font-semibold">{t('engines.listHeading')}</h2>
        <GraphListView
          summaryKey="explore.listSummary"
          nodes={picture.nodes}
          edges={picture.edges}
          selection={selectedNodeId === null ? null : { kind: 'node', id: selectedNodeId }}
          onselect={(selection) => {
            selectedNodeId = selection?.kind === 'node' ? selection.id : null;
          }}
        />
      </section>
    {/if}
  {/if}
</div>
