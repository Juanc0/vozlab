/**
 * The **shape of the relations** of the exploration view.
 *
 * The user chooses how the arrows are drawn: a single line, a smooth curve,
 * an open curve, a wide arc or the exaggerated haystack. The choice is a
 * pure mapping, so it can be unit tested without a canvas.
 *
 * The names of the presets are the ones the interface shows; the way each
 * one is drawn is the one Cytoscape understands.
 *
 * **There is no route with right angles.** The shape was in the interface
 * and the user did not like it: the square corners read as a diagram of
 * pipes rather than as the relations of a knowledge graph, and a relation
 * that turns at right angles draws the eye to the turn instead of to what
 * it joins. The shape is gone from both graphs — the router that computed
 * the turn is gone with it, and no dead code is left behind.
 */

/** The shapes a relation can be drawn with. */
export type EdgeStyle = 'straight' | 'bezier' | 'unbundled' | 'arc' | 'haystack';

/** Every shape, in the order the control shows them. */
export const EDGE_STYLES: readonly EdgeStyle[] = [
  'straight',
  'bezier',
  'unbundled',
  'arc',
  'haystack'
];

/** How one shape is drawn. */
export interface EdgeStylePreset {
  /** The name of the shape. */
  readonly id: EdgeStyle;
  /**
   * The `curve-style` of Cytoscape that draws it.
   *
   * `straight` is a single line; `bezier` and `unbundled-bezier` are the
   * curves; `haystack` is the exaggerated one.
   */
  readonly curveStyle: 'straight' | 'bezier' | 'unbundled-bezier' | 'haystack';
  /**
   * How far the control point of the curve is from the line between the
   * two nodes. Zero for the shapes that have no control point.
   */
  readonly controlPointDistance: number;
}

/**
 * The presets of the shapes.
 *
 * The `arc` is a wide `bezier`: Cytoscape has no arc of its own, and a
 * curve that leaves the line between the two nodes that far reads as one.
 */
export const EDGE_STYLE_PRESETS: Readonly<Record<EdgeStyle, EdgeStylePreset>> = {
  straight: { id: 'straight', curveStyle: 'straight', controlPointDistance: 0 },
  bezier: { id: 'bezier', curveStyle: 'bezier', controlPointDistance: 40 },
  unbundled: { id: 'unbundled', curveStyle: 'unbundled-bezier', controlPointDistance: 40 },
  arc: { id: 'arc', curveStyle: 'bezier', controlPointDistance: 140 },
  haystack: { id: 'haystack', curveStyle: 'haystack', controlPointDistance: 0 }
};

/**
 * The style properties a relation is drawn with.
 *
 * Every shape is a curve style and nothing more: no shape needs a route,
 * so none of them is routed.
 */
export function edgeStyleProperties(style: EdgeStyle): Record<string, string | number> {
  const preset = EDGE_STYLE_PRESETS[style];

  return {
    'curve-style': preset.curveStyle,
    'control-point-distances': preset.controlPointDistance,
    'control-point-weights': 0.5
  };
}
