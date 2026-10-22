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
  }

  let { engine, measurement, frames, nodes, edges }: Props = $props();

  const locale = getLocaleState();
  const t = locale.t;

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

<div class="p-3">
  <h2 class="text-section">{t('engines.readoutHeading', { name: t(engine.nameKey) })}</h2>

  <!--
    What the engine brings of its own. It is said here, next to the
    measurements: the comparison does not pretend that the engines do the
    same thing.
  -->
  <p class="mt-1 text-small text-muted">{t(engine.noteKey)}</p>

  <!--
    The engine that brings its own arrangement says so: the comparison
    offers the room and the data, and it does not impose a layout that the
    engine cannot use.
  -->
  {#if engine.layout === null}
    <p class="mt-2 rounded-control bg-raised p-2 text-small">
      {t('engines.sharedLayoutSigma')}
    </p>
  {/if}

  <!--
    The shape of the relations is a control of the comparison, and the
    engine that cannot reproduce it says so instead of pretending.
  -->
  {#if engine.id === 'sigma'}
    <p class="mt-2 rounded-control bg-raised p-2 text-small">
      {t('engines.edgeStyleSigma')}
    </p>
  {/if}

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

    <dt class="text-muted">{t('engines.settledLabel')}</dt>
    <dd>
      {measurement === undefined
        ? '—'
        : measurement.settled
          ? t('engines.settledYes')
          : t('engines.settledNo')}
    </dd>

    <!--
      The pairs of cards that lie on top of each other: the metric that
      told the truth about the springs.
    -->
    <dt class="text-muted">{t('engines.overlapsLabel')}</dt>
    <dd class="font-mono">
      {measurement?.overlaps === undefined
        ? '—'
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

    <dt class="text-muted">{t('engines.iterationsLabel')}</dt>
    <dd class="font-mono">
      {measurement?.iterations === undefined
        ? '—'
        : t('engines.iterationsValue', {
            count: formatNumber(locale.locale, measurement.iterations)
          })}
    </dd>

    <dt class="text-muted">{t('engines.layoutFrameLabel')}</dt>
    <dd class="font-mono">
      {measurement?.frameMs === undefined
        ? '—'
        : t('engines.frameLayoutValue', { value: measurement.frameMs.toFixed(2) })}
    </dd>

    <!--
      Whether the same picture comes out twice. It is not the same question
      for the five engines, and the answer says so.
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
    The relations that were reversed, by name: the reader has to be able to
    see **which** ones are drawn against what they say.

    The list is folded away: ten relations with the titles of their cards
    take the whole panel, and the picture is what the panel is for.
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
