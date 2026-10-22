/**
 * The **path of a relation** — the five shapes of `$lib/graph/explore/
 * edge-style`, written as SVG.
 *
 * The incumbent draws its relations with Cytoscape: a curve style and a
 * control-point distance, and Cytoscape computes the points. A painter that
 * owns its SVG has to compute them, and this module is that computation —
 * **pure**, deterministic and tested on its own: two endpoints, the size of
 * their cards and a shape in; a `d`, the label's place and the arrow in.
 *
 * ## The five shapes
 *
 * | shape | what is drawn |
 * | --- | --- |
 * | `straight` | a line, clipped at both cards |
 * | `bezier` | a quadratic curve, its control point 40 px beside the line |
 * | `unbundled` | a cubic curve with two control points: the open one |
 * | `arc` | the quadratic curve with the control point 140 px beside the line |
 * | `haystack` | a line that starts **inside** the source card, under it |
 *
 * The shapes are **approximations** of Cytoscape's, not a port of its
 * internals: `bezier` and `arc` are quadratic curves where Cytoscape
 * straightens the middle edge of a bundle, and `unbundled` has two control
 * points where Cytoscape's preset has one. The comparison says so in the
 * note of the painter. What does not change is the **vocabulary**: five
 * shapes, the same five the control offers, and the label always on the
 * curve and always readable.
 *
 * ## The ends
 *
 * A relation does not start at the centre of a card: it starts at its
 * **border**. The line is clipped against the rectangle of the card, in the
 * direction of the first control point — the tangent of the curve at the
 * end — so a curve leaves the card in the direction it is drawn.
 */

import type { EdgeStyle } from '$lib/graph/explore/edge-style';

/** The horizontal distance of the control point of the smooth curve, in pixels. */
export const BEZIER_DISTANCE = 40;

/** The horizontal distance of the control point of the wide arc, in pixels. */
export const ARC_DISTANCE = 140;

/**
 * How long the arrowhead is, in pixels.
 *
 * It is the length of Cytoscape's `triangle` arrow at its default scale: a
 * mark that says which way the relation goes without becoming a shape of
 * its own.
 */
export const ARROW_LENGTH = 9;

/** How wide the base of the arrowhead is, in pixels. */
export const ARROW_HALF_WIDTH = 3.5;

/** The size of the name of a relation, in pixels. */
export const EDGE_LABEL_FONT_SIZE = 11;

/**
 * The padding of the plate behind the name of a relation, in pixels.
 *
 * It is Cytoscape's `text-background-padding`: the air between the text and
 * the edge of its plate.
 */
export const EDGE_LABEL_PLATE_PADDING = 2;

/**
 * The dash pattern of a relation, by its status.
 *
 * `PENDING` is dashed and `REJECTED` is dotted, exactly as the stylesheet of
 * the incumbent says. An `ACTIVE` relation is a solid line.
 */
export const EDGE_DASH: Readonly<Record<string, string | undefined>> = {
  ACTIVE: undefined,
  DRAFT: undefined,
  PENDING: '6 4',
  REJECTED: '1 3'
};

/** One end of a relation: the centre of a card and its size. */
export interface EdgeEndpoint {
  /** The x of the centre of the card. */
  readonly x: number;
  /** The y of the centre of the card. */
  readonly y: number;
  /** The width of the card. */
  readonly width: number;
  /** The height of the card. */
  readonly height: number;
}

/** Where the name of a relation is written. */
export interface EdgeLabelPlacement {
  /** The x of the middle of the text. */
  readonly x: number;
  /** The y of the middle of the text. */
  readonly y: number;
  /**
   * The angle of the text, in radians.
   *
   * It is the angle of the curve at its middle, flipped when it would read
   * upside down — the same rule as Cytoscape's `autorotate`.
   */
  readonly angle: number;
}

/** The geometry of one relation. */
export interface EdgeGeometry {
  /** The path of the line, ready for `<path d>`. */
  readonly path: string;
  /** The path of the arrowhead, ready for `<path d>`. */
  readonly arrow: string;
  /** Where the name goes. */
  readonly label: EdgeLabelPlacement;
  /** The point the line leaves the source card from. */
  readonly start: { readonly x: number; readonly y: number };
  /** The point the line meets the target card at. */
  readonly end: { readonly x: number; readonly y: number };
  /** The middle of the line, where the label sits. */
  readonly middle: { readonly x: number; readonly y: number };
}

/** A point of the plane. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Rounds a number for a path.
 *
 * Three decimals are below a thousandth of a pixel: the string is stable
 * between runs and the picture is the same one every time.
 */
function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Writes a point as the two numbers of a path. */
function pair(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`;
}

/**
 * Clips a line that leaves the centre of a card at its border.
 *
 * The direction is the one the curve leaves with: the first control point
 * for the source, the last one for the target. A card is a rectangle with
 * round corners, and the corner radius is small enough that the rectangle
 * is the right answer for the end of a relation.
 *
 * @param centre - The centre of the card.
 * @param towards - A point the line goes towards.
 * @param endpoint - The card.
 * @returns The point where the line crosses the border of the card.
 */
export function clipToCard(centre: Point, towards: Point, endpoint: EdgeEndpoint): Point {
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;

  if (dx === 0 && dy === 0) {
    return centre;
  }

  const halfWidth = Math.max(1, endpoint.width) / 2;
  const halfHeight = Math.max(1, endpoint.height) / 2;

  // The distance, as a fraction of the direction, at which the line meets
  // each pair of sides; the nearer one is the border.
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const t = Math.min(tx, ty);

  return { x: centre.x + dx * t, y: centre.y + dy * t };
}

/** A point of a quadratic curve. */
function quadraticPoint(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;

  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y
  };
}

/** A point of a cubic curve. */
function cubicPoint(from: Point, first: Point, second: Point, to: Point, t: number): Point {
  const u = 1 - t;

  return {
    x: u * u * u * from.x + 3 * u * u * t * first.x + 3 * u * t * t * second.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * first.y + 3 * u * t * t * second.y + t * t * t * to.y
  };
}

/**
 * Puts an angle in the readable half of the plane.
 *
 * A label rotated past a quarter of a turn reads upside down: the angle is
 * turned half a turn, exactly as `text-rotation: autorotate` does.
 */
export function readableAngle(angle: number): number {
  if (angle > Math.PI / 2) {
    return angle - Math.PI;
  }

  if (angle < -Math.PI / 2) {
    return angle + Math.PI;
  }

  return angle;
}

/**
 * The perpendicular of the line between two points.
 *
 * It is the side the control point of a curve is put on: always the same
 * side of the direction, so the same picture comes out twice.
 */
function normal(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x: 0, y: -1 };
  }

  return { x: -dy / length, y: dx / length };
}

/** The arrowhead at the end of a relation. */
function arrowAt(tip: Point, from: Point): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = length === 0 ? 1 : dx / length;
  const uy = length === 0 ? 0 : dy / length;
  const base = { x: tip.x - ux * ARROW_LENGTH, y: tip.y - uy * ARROW_LENGTH };
  const side = { x: -uy * ARROW_HALF_WIDTH, y: ux * ARROW_HALF_WIDTH };

  return `M ${pair(tip)} L ${pair({ x: base.x + side.x, y: base.y + side.y })} L ${pair({
    x: base.x - side.x,
    y: base.y - side.y
  })} Z`;
}

/** The control point of a quadratic curve, beside the middle of the line. */
function quadraticControl(from: Point, to: Point, distance: number): Point {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const n = normal(from, to);

  return { x: middle.x + n.x * distance, y: middle.y + n.y * distance };
}

/**
 * Builds the geometry of one relation.
 *
 * @param style - The shape the relation is drawn with.
 * @param source - The card the relation leaves.
 * @param target - The card the relation goes to.
 * @returns The path, the arrow, the label's place and the ends.
 */
export function edgeGeometry(
  style: EdgeStyle,
  source: EdgeEndpoint,
  target: EdgeEndpoint
): EdgeGeometry {
  const from: Point = { x: source.x, y: source.y };
  const to: Point = { x: target.x, y: target.y };

  if (style === 'haystack') {
    // The haystack is the loose line: it starts **inside** the source card,
    // where the card will cover it, and it meets the target at its border.
    // The visible line is shorter and it seems to come out of the card
    // rather than to touch it — the look of a haystack of relations.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const ux = length === 0 ? 1 : dx / length;
    const uy = length === 0 ? 0 : dy / length;
    const inside =
      Math.min(Math.max(1, source.width), Math.max(1, source.height)) * 0.45;

    const start = { x: from.x + ux * inside, y: from.y + uy * inside };
    const end = clipToCard(to, from, target);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    return {
      path: `M ${pair(start)} L ${pair(end)}`,
      arrow: arrowAt(end, start),
      label: { ...middle, angle: readableAngle(Math.atan2(end.y - start.y, end.x - start.x)) },
      start,
      end,
      middle
    };
  }

  if (style === 'straight') {
    const start = clipToCard(from, to, source);
    const end = clipToCard(to, from, target);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    return {
      path: `M ${pair(start)} L ${pair(end)}`,
      arrow: arrowAt(end, start),
      label: { ...middle, angle: readableAngle(Math.atan2(end.y - start.y, end.x - start.x)) },
      start,
      end,
      middle
    };
  }

  if (style === 'unbundled') {
    // Two control points, on the same side: the curve opens instead of
    // closing like the smooth one.
    const control = quadraticControl(from, to, BEZIER_DISTANCE);
    const first = { x: (from.x + 2 * control.x) / 3, y: (from.y + 2 * control.y) / 3 };
    const second = { x: (to.x + 2 * control.x) / 3, y: (to.y + 2 * control.y) / 3 };

    const start = clipToCard(from, first, source);
    const end = clipToCard(to, second, target);

    // The label follows the curve that is **drawn**, from the border of one
    // card to the border of the other, and not the curve between the
    // centres the clipping cut off.
    const middle = cubicPoint(start, first, second, end, 0.5);
    const tangent = {
      x:
        3 * (1 - 0.5) * (1 - 0.5) * (first.x - start.x) +
        6 * (1 - 0.5) * 0.5 * (second.x - first.x) +
        3 * 0.5 * 0.5 * (end.x - second.x),
      y:
        3 * (1 - 0.5) * (1 - 0.5) * (first.y - start.y) +
        6 * (1 - 0.5) * 0.5 * (second.y - first.y) +
        3 * 0.5 * 0.5 * (end.y - second.y)
    };

    return {
      path: `M ${pair(start)} C ${pair(first)} ${pair(second)} ${pair(end)}`,
      arrow: arrowAt(end, second),
      label: { ...middle, angle: readableAngle(Math.atan2(tangent.y, tangent.x)) },
      start,
      end,
      middle
    };
  }

  // `bezier` and `arc`: the same quadratic, with the control point at its
  // own distance from the line.
  const distance = style === 'arc' ? ARC_DISTANCE : BEZIER_DISTANCE;
  const control = quadraticControl(from, to, distance);
  const start = clipToCard(from, control, source);
  const end = clipToCard(to, control, target);

  // The label sits on the curve that is **drawn**, and it turns with it.
  const middle = quadraticPoint(start, control, end, 0.5);
  const tangent = {
    x: 2 * (1 - 0.5) * (control.x - start.x) + 2 * 0.5 * (end.x - control.x),
    y: 2 * (1 - 0.5) * (control.y - start.y) + 2 * 0.5 * (end.y - control.y)
  };

  return {
    path: `M ${pair(start)} Q ${pair(control)} ${pair(end)}`,
    arrow: arrowAt(end, control),
    label: { ...middle, angle: readableAngle(Math.atan2(tangent.y, tangent.x)) },
    start,
    end,
    middle
  };
}
