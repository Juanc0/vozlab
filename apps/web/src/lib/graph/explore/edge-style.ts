/**
 * The **shape of the relations** of the exploration view.
 *
 * The user chooses how the arrows are drawn: a single line, a route with
 * right angles, a smooth curve, an open curve, a wide arc or the
 * exaggerated haystack. The choice is a pure mapping, so it can be unit
 * tested without a canvas.
 *
 * The names of the presets are the ones the interface shows; the way each
 * one is drawn is the one Cytoscape understands.
 */

import type { OrthogonalRoute } from './orthogonal';

/** The shapes a relation can be drawn with. */
export type EdgeStyle = 'straight' | 'orthogonal' | 'bezier' | 'unbundled' | 'arc' | 'haystack';

/** Every shape, in the order the control shows them. */
export const EDGE_STYLES: readonly EdgeStyle[] = [
  'straight',
  'orthogonal',
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
   * `taxi` is the only curve style that draws right angles; `straight` a
   * single line; `bezier` and `unbundled-bezier` the curves; `haystack` the
   * exaggerated one.
   */
  readonly curveStyle: 'straight' | 'taxi' | 'bezier' | 'unbundled-bezier' | 'haystack';
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
  orthogonal: { id: 'orthogonal', curveStyle: 'taxi', controlPointDistance: 0 },
  bezier: { id: 'bezier', curveStyle: 'bezier', controlPointDistance: 40 },
  unbundled: { id: 'unbundled', curveStyle: 'unbundled-bezier', controlPointDistance: 40 },
  arc: { id: 'arc', curveStyle: 'bezier', controlPointDistance: 140 },
  haystack: { id: 'haystack', curveStyle: 'haystack', controlPointDistance: 0 }
};

/**
 * The style properties a relation is drawn with.
 *
 * The orthogonal shape is the only one that needs the route: its turn is
 * the channel the router found between the two nodes.
 */
export function edgeStyleProperties(
  style: EdgeStyle,
  route: OrthogonalRoute | null = null
): Record<string, string | number> {
  const preset = EDGE_STYLE_PRESETS[style];

  const properties: Record<string, string | number> = {
    'curve-style': preset.curveStyle,
    'control-point-distances': preset.controlPointDistance,
    'control-point-weights': 0.5
  };

  if (style === 'orthogonal' && route !== null && route.waypoints.length > 0) {
    properties['taxi-direction'] = route.axis;
    properties['taxi-turn'] = `${Math.round(route.turnRatio * 100)}%`;
    // The corners of the route are square: the shape is called "right
    // angles", and a rounded corner is a different shape.
    properties['taxi-radius'] = 0;
    // The turn the router found is close to the nodes it goes around; the
    // curve style would fall back to another shape when the turn is too
    // close, and the route would not be the one that was computed.
    properties['taxi-turn-min-distance'] = 4;
  }

  return properties;
}
