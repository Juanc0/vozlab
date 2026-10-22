<script lang="ts">
  /**
   * The **readout of an engine** — what was measured on the engine that is
   * being looked at.
   *
   * The measurements belong to the engine: the time it took to settle, the
   * pairs of cards that lie on top of each other, whether the same picture
   * comes out twice and the relations the arrangement had to break. They
   * are the numbers of **this** engine, measured on **this** engine — never
   * the ones of the engine that was on screen before.
   *
   * The panel is **folded**: the header — the name and the three numbers
   * that answer the question at a glance — is always visible, and the full
   * table is one click away. The comparison exists to look at pictures, and
   * a table of twelve rows over the picture is the opposite of that.
   *
   * The three numbers are:
   *
   * - **the frame**: what a frame of the arrangement costs, with the frame
   *   measurement when there is one and the arrangement's own frame
   *   otherwise;
   * - **the pairs of cards on top of each other**: the one metric that told
   *   the truth about the springs;
   * - **the state**: whether the picture is a living spring that reached
   *   its shape, or a one-pass arrangement that settled.
   *
   * The honesty rules stay: a layout with no convergence criterion says so,
   * and an engine that cannot do something says so too.
   */
  import type { NodeDto, SubgraphEdgeDto } from '$lib/api/types';
  import { formatNumber } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';
  import type { EngineDescriptor, EngineMeasurement } from './engines';
  import type { FrameSummary } from './frames';

  interface Props {
    /** The engine that is on screen. */
    engine: EngineDescriptor;
    /** What the engine reported about its arrangement. */
    measurement: EngineMeasurement | undefined;
    /** The times between the frames of the engine, if it was measured. */
    frames: FrameSummary | undefined;
    /** The nodes of the picture — the reversed relations are named with them. */
    nodes: NodeDto[];
    /** The relations of the picture. */
    edges: SubgraphEdgeDto[];
    /**
     * `true` when the full table is open.
     *
     * The fold belongs to the **comparison**, not to the engine: it is one
     * fold for the whole surface, and it survives a tab switch. The page
     * owns the state and binds it here.
     */
    open?: boolean;
  }

  let {
    engine,
    measurement,
    frames,
    nodes,
    edges,
    open = $bindable(false)
  }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

  /** The id of the folded table — the toggle points at it. */
  const uid = $props.id();
  const detailId = `engine-readout-detail-${uid}`;

  /**
   * The frame the reader is told about.
   *
   * The frame measurement of `measureFrames` is the truth when it was run;
   * before that, the arrangement reports the median of its own frames. The
   * source is named in the full table: here it is one number, not two.
   */
  const frame = $derived(frames?.median ?? measurement?.frameMs);

  /** The frame, with its unit, or the dash of a picture not measured yet. */
  const frameValue = $derived(
    frame === undefined
      ? t('common.emptyValue')
      : t('engines.kpiMs', { value: frame.toFixed(2) })
  );

  /** The pairs of cards on top of each other, singular or plural. */
  const overlapsValue = $derived.by(() => {
    if (measurement?.overlaps === undefined) {
      return t('common.emptyValue');
    }

    const count = formatNumber(locale.locale, measurement.overlaps);

    return measurement.overlaps === 1
      ? t('engines.overlapsOne', { count })
      : t('engines.overlapsValue', { count });
  });

  /**
   * Whether the picture is alive and has reached its shape, or has settled.
   *
   * A living spring never settles: "Asentada" is reserved for the one-pass
   * arrangements, and the shortcut says which one is on screen without the
   * whole table.
   */
  const stateValue = $derived.by(() => {
    if (measurement === undefined) {
      return t('common.emptyValue');
    }

    if (measurement.alive === true) {
      return measurement.shapeReached
        ? t('engines.stateAlive')
        : t('engines.stateSeeking');
    }

    return measurement.settled
      ? t('engines.stateSettled')
      : t('engines.stateUnsettled');
  });

  /**
   * The names of the relations that were **reversed** by the arrangement.
   *
   * The reader has to see **which** ones are drawn against what they say,
   * and not only how many.
   */
  const reversedNames = $derived.by(() => {
    const ids = measurement?.reversedRelations ?? [];

    return ids
      .map((id) => {
        const relation = edges.find((edge) => edge.id === id);

        if (relation === undefined) {
          return id;
        }

        const source = nodes.find((node) => node.id === relation.sourceNodeId);
        const target = nodes.find((node) => node.id === relation.targetNodeId);

        return `${source?.title ?? '?'} → ${target?.title ?? '?'}`;
      })
      .join(', ');
  });
</script>

<div class="p-2 sm:p-3" data-testid="engine-readout">
  <!--
    The header is the folded readout: the name of the engine, the three
    numbers and the quiet control that opens the table. The grid puts the
    three of them in **one line** on a phone, and the numbers on their own
    line under the name on a wide screen.
  -->
  <div
    class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-3 sm:gap-y-2"
  >
    <h2 class="col-start-1 row-start-1 min-w-0 truncate text-section max-sm:text-body">
      {t(engine.nameKey)}
    </h2>

    <dl
      class="col-start-2 row-start-1 flex items-baseline gap-x-2 sm:col-span-2 sm:col-start-1 sm:row-start-2 sm:gap-x-4"
      data-testid="readout-kpis"
    >
      <div class="flex items-baseline gap-1.5 whitespace-nowrap">
        <dt class="sr-only sm:not-sr-only sm:text-small sm:text-muted">
          {t('engines.frameLabel')}
        </dt>
        <dd class="font-mono text-body">{frameValue}</dd>
      </div>

      <div class="flex items-baseline gap-1.5 whitespace-nowrap">
        <dt class="sr-only sm:not-sr-only sm:text-small sm:text-muted">
          {t('engines.overlapsLabel')}
        </dt>
        <dd class="font-mono text-body">{overlapsValue}</dd>
      </div>

      <div class="flex items-baseline gap-1.5 whitespace-nowrap">
        <dt class="sr-only sm:not-sr-only sm:text-small sm:text-muted">
          {t('engines.stateLabel')}
        </dt>
        <dd class="text-body">{stateValue}</dd>
      </div>
    </dl>

    <!--
      The quiet control of the table. The text is visually hidden on a
      phone — the icon and the accessible name carry it — and it is the
      whole control on a wide screen. The state is announced, and the
      table stays in the document while it is folded.
    -->
    <button
      type="button"
      class="col-start-3 row-start-1 grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-raised hover:text-text sm:col-start-2 sm:inline-flex sm:size-auto sm:h-8 sm:gap-1.5 sm:px-2.5"
      aria-expanded={open}
      aria-controls={detailId}
      data-testid="readout-toggle"
      onclick={() => {
        open = !open;
      }}
    >
      <span class="max-sm:sr-only">{t('engines.readoutToggle')}</span>
      <svg
        aria-hidden="true"
        class="size-4 shrink-0 transition-transform motion-reduce:transition-none {open
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
  </div>

  <!--
    The full readout: the note of the engine, the table of measurements,
    the relations that were reversed and the findings. It is folded by
    default and stays in the document, so `aria-controls` always points at
    the same element.
  -->
  <div id={detailId} hidden={!open} data-testid="readout-details">
    <!--
      What the engine brings of its own. It is said here, next to the
      measurements: the comparison does not pretend that the engines do the
      same thing.
    -->
    <p class="mt-2 text-small text-muted">{t(engine.noteKey)}</p>

    <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-small">
      <dt class="text-muted">{t('engines.frameLabel')}</dt>
      <dd class="font-mono">
        {#if frames === undefined}
          {t('engines.noMeasurement')}
        {:else}
          {t('engines.frameValue', { value: frames.median.toFixed(2) })}
          <span class="text-muted">
            {t('engines.framePeak', { value: frames.max.toFixed(2) })}
          </span>
          <span class="text-muted">
            {t('engines.frameCount', {
              count: formatNumber(locale.locale, frames.frames)
            })}
          </span>
        {/if}
      </dd>

      <dt class="text-muted">{t('engines.layoutLabel')}</dt>
      <dd class="font-mono">
        {measurement === undefined ? '—' : t('engines.layoutValue', { value: measurement.ms.toFixed(1) })}
      </dd>

      <!--
        The painter's own numbers. The canvas of Cytoscape does not report
        them, and the readout does not invent them: the rows are there when
        the engine measured them.
      -->
      {#if measurement?.buildMs !== undefined}
        <dt class="text-muted">{t('engines.buildLabel')}</dt>
        <dd class="font-mono">
          {t('engines.buildValue', { value: measurement.buildMs.toFixed(2) })}
        </dd>
      {/if}

      {#if measurement?.domElements !== undefined}
        <dt class="text-muted">{t('engines.domLabel')}</dt>
        <dd class="font-mono">
          {t('engines.domValue', {
            count: formatNumber(locale.locale, measurement.domElements)
          })}
        </dd>
      {/if}

      <!--
        The living spring is not settled, and the readout does not say it is:
        it says whether the spring is awake and whether the picture reached its
        shape below the threshold. A one-pass arrangement keeps the old row.
      -->
      {#if measurement?.alive === true}
        <dt class="text-muted">{t('engines.motionLabel')}</dt>
        <dd>{measurement.awake ? t('engines.aliveAwake') : t('engines.aliveIdle')}</dd>

        <dt class="text-muted">{t('engines.shapeLabel')}</dt>
        <dd>
          {measurement.shapeReached
            ? t('engines.shapeReached', {
                threshold: formatNumber(
                  locale.locale,
                  measurement.threshold ?? 1.5
                )
              })
            : t('engines.shapeMoving')}
        </dd>
      {:else}
        <dt class="text-muted">{t('engines.settledLabel')}</dt>
        <dd>
          {measurement === undefined
            ? '—'
            : measurement.settled
              ? t('engines.settledYes')
              : t('engines.settledNo')}
        </dd>
      {/if}

      <!--
        The pairs of cards that lie on top of each other: the metric that
        told the truth about the springs.
      -->
      <dt class="text-muted">{t('engines.overlapsLabel')}</dt>
      <dd class="font-mono">
        {measurement?.overlaps === undefined
          ? '—'
          : measurement.overlaps === 1
            ? t('engines.overlapsOne', {
                count: formatNumber(locale.locale, measurement.overlaps)
              })
            : t('engines.overlapsValue', {
                count: formatNumber(locale.locale, measurement.overlaps)
              })}
      </dd>

      <!--
        The steps of the simulation and the time a frame of it took: the
        spring is run in slices, and the slices are what the reader sees.
      -->
      <dt class="text-muted">{t('engines.ticksLabel')}</dt>
      <dd class="font-mono">
        {measurement?.ticks === undefined
          ? '—'
          : t('engines.ticksValue', {
              count: formatNumber(locale.locale, measurement.ticks)
            })}
      </dd>

      <dt class="text-muted">{t('engines.layoutFrameLabel')}</dt>
      <dd class="font-mono">
        {measurement?.frameMs === undefined
          ? '—'
          : t('engines.frameLayoutValue', { value: measurement.frameMs.toFixed(2) })}
      </dd>

      <dt class="text-muted">{t('engines.tickLabel')}</dt>
      <dd class="font-mono">
        {measurement?.tickMs === undefined
          ? '—'
          : t('engines.tickValue', { value: measurement.tickMs.toFixed(3) })}
      </dd>

      <!--
        Whether the same picture comes out twice. It is not the same question
        for every engine, and the answer says so.
      -->
      <dt class="text-muted">{t('engines.reproducibleLabel')}</dt>
      <dd>{t(engine.reproducibleKey)}</dd>

      <!--
        The relations that were reversed to be able to order the graph. It is
        the number that says the most about a layered arrangement: the
        relations of VozLab have cycles, and the arrangement has to break
        them.
      -->
      <dt class="text-muted">{t('engines.reversedLabel')}</dt>
      <dd class="font-mono">
        {measurement?.reversedRelations === undefined
          ? '—'
          : t('engines.reversedValue', {
              count: formatNumber(locale.locale, measurement.reversedRelations.length)
            })}
      </dd>
    </dl>

    <!--
      The living spring, said in words: it does not settle, it moves at rest,
      and its shape is reached below a threshold. The one-pass arrangements
      carry their own note beside the tabs — a hierarchy does not breathe.
    -->
    {#if measurement?.alive === true}
      <p class="mt-2 text-small text-muted" role="note" data-testid="alive-note">
        {t('engines.aliveNote', {
          threshold: formatNumber(locale.locale, measurement.threshold ?? 1.5)
        })}
      </p>
    {/if}

    <!--
      The relations that were reversed, by name: the reader has to be able to
      see **which** ones are drawn against what they say.
    -->
    {#if (measurement?.reversedRelations?.length ?? 0) > 0}
      <details class="mt-2 text-small">
        <summary class="cursor-pointer text-muted">
          {t('engines.reversedToggle', {
            count: formatNumber(locale.locale, measurement?.reversedRelations?.length ?? 0)
          })}
        </summary>
        <p class="mt-1 text-muted">
          {t('engines.reversedDetail', { relations: reversedNames })}
        </p>
      </details>
    {/if}

    <!--
      What the engine cannot do the same as the others. It is said here, with
      the engine it concerns: the comparison is honest, and it is honest one
      engine at a time.
    -->
    <h3 class="mt-4 text-body font-semibold">{t('engines.findingsHeading')}</h3>
    <ul class="mt-1 list-disc space-y-1 pl-5 text-small text-muted">
      {#each engine.findingKeys as key (key)}
        <li>{t(key)}</li>
      {/each}
    </ul>
  </div>
</div>
