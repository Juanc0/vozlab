/**
 * The **orthogonal router** of the exploration view.
 *
 * A relation that is drawn with right angles has to go *around* the nodes:
 * a relation that crosses a card hides the content of the card and reads
 * as a mistake. The router is therefore a **pure function** of the two
 * endpoints and the boxes of the nodes that are in the way — it is unit
 * tested, not buried in the component.
 *
 * The route has the shape Cytoscape's `taxi` curve style draws:
 *
 * ```text
 *  source ──┐            ┌── target
 *           └── turn ────┘
 * ```
 *
 * The first segment leaves the source sideways, the middle one is
 * perpendicular to it and the last one enters the target sideways. The
 * **turn** is the coordinate of the middle segment: the router looks for a
 * channel that is free of nodes, and the drawing uses that channel.
 */

/** A point of the plane, in the model coordinates of the canvas. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A node as a box: its centre and its size. */
export interface Box {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

/** The route between two nodes. */
export interface OrthogonalRoute {
  /** The waypoints of the route, from the source to the target. */
  readonly waypoints: readonly Point[];
  /** The primary axis of the route: the one the first segment follows. */
  readonly axis: 'horizontal' | 'vertical';
  /** The distance from the edge of the source to the turn. */
  readonly turnDistance: number;
  /** The turn as a fraction of the gap between the two nodes (0…1). */
  readonly turnRatio: number;
  /** How many nodes the route crosses. Zero when it crosses none. */
  readonly crossings: number;
}

/**
 * The distance the turn keeps from the nodes it goes around.
 *
 * The drawing needs it too: a turn that lands on the edge of a node would
 * be drawn on top of it. It is also the smallest distance the `taxi` curve
 * style accepts without falling back to another shape.
 */
export const MIN_TURN_DISTANCE = 6;

/** The clearance the route keeps around a node. */
const CLEARANCE = 2;

/** The tolerance of the comparisons of the router. */
const EPSILON = 0.001;

/** Whether two boxes are the same node. */
function sameBox(left: Box, right: Box): boolean {
  return (
    Math.abs(left.cx - right.cx) < EPSILON &&
    Math.abs(left.cy - right.cy) < EPSILON &&
    Math.abs(left.width - right.width) < EPSILON &&
    Math.abs(left.height - right.height) < EPSILON
  );
}

/** The left, right, top and bottom edges of a box. */
function edges(box: Box): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: box.cx - box.width / 2,
    right: box.cx + box.width / 2,
    top: box.cy - box.height / 2,
    bottom: box.cy + box.height / 2
  };
}

/**
 * Whether a segment crosses a box.
 *
 * The segments of the route are axis-aligned, so the test is a plain
 * interval overlap on both axes.
 */
export function segmentCrossesBox(
  from: Point,
  to: Point,
  box: Box
): boolean {
  const bounds = edges(box);
  const minX = Math.min(from.x, to.x) - CLEARANCE;
  const maxX = Math.max(from.x, to.x) + CLEARANCE;
  const minY = Math.min(from.y, to.y) - CLEARANCE;
  const maxY = Math.max(from.y, to.y) + CLEARANCE;

  return (
    maxX > bounds.left &&
    minX < bounds.right &&
    maxY > bounds.top &&
    minY < bounds.bottom
  );
}

/**
 * The free intervals of an axis, given the boxes that block it.
 *
 * The blocked intervals are merged and the gaps between them are the
 * channels a route can use.
 */
function freeChannels(
  low: number,
  high: number,
  blocked: readonly Box[],
  axis: 'x' | 'y'
): Array<[number, number]> {
  const intervals = blocked
    .map((box) => {
      const bounds = edges(box);
      return axis === 'x'
        ? ([bounds.left, bounds.right] as [number, number])
        : ([bounds.top, bounds.bottom] as [number, number]);
    })
    .filter(([from, to]) => to > low && from < high)
    .sort((left, right) => left[0] - right[0]);

  const merged: Array<[number, number]> = [];

  for (const interval of intervals) {
    const last = merged[merged.length - 1];

    if (last !== undefined && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
      continue;
    }

    merged.push([interval[0], interval[1]]);
  }

  const channels: Array<[number, number]> = [];
  let cursor = low;

  for (const [from, to] of merged) {
    if (from > cursor) {
      channels.push([cursor, from]);
    }
    cursor = Math.max(cursor, to);
  }

  if (cursor < high) {
    channels.push([cursor, high]);
  }

  return channels;
}

/**
 * The candidates of the turn, ordered by how close they are to the natural
 * middle of the gap.
 *
 * The middle of the gap is the first candidate: it is the shortest route.
 * The other candidates are the channels that are free of nodes — the middle
 * of the channel and its two edges, pulled away from the nodes they go
 * around.
 */
function turnCandidates(
  low: number,
  high: number,
  blocked: readonly Box[],
  axis: 'x' | 'y'
): number[] {
  const middle = (low + high) / 2;
  const channels = freeChannels(low, high, blocked, axis);
  const candidates: number[] = [];

  for (const [from, to] of channels) {
    const start = from + MIN_TURN_DISTANCE;
    const end = to - MIN_TURN_DISTANCE;

    if (end >= start) {
      candidates.push((start + end) / 2);
    }

    if (start <= to) {
      candidates.push(start);
    }

    if (end >= from) {
      candidates.push(end);
    }
  }

  candidates.push(middle);

  return candidates
    .map((value) => Math.min(Math.max(value, low), high))
    .filter(
      (value) =>
        value >= low + MIN_TURN_DISTANCE - EPSILON &&
        value <= high - MIN_TURN_DISTANCE + EPSILON
    )
    .sort((left, right) => Math.abs(left - middle) - Math.abs(right - middle));
}

/** The number of nodes a set of segments crosses. */
function countCrossings(segments: readonly (readonly [Point, Point])[], obstacles: readonly Box[]): number {
  let crossings = 0;

  for (const obstacle of obstacles) {
    const crossed = segments.some(([from, to]) => segmentCrossesBox(from, to, obstacle));

    if (crossed) {
      crossings += 1;
    }
  }

  return crossings;
}

/** The length of a route. */
function routeLength(waypoints: readonly Point[]): number {
  let length = 0;

  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1];
    const current = waypoints[index];
    length += Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
  }

  return length;
}

/**
 * The route with the **horizontal** primary axis: the relation leaves the
 * source sideways and enters the target sideways.
 *
 * It answers `null` when the two nodes are too close on that axis: there is
 * no room for a turn between them.
 */
function horizontalRoute(
  source: Box,
  target: Box,
  obstacles: readonly Box[]
): OrthogonalRoute | null {
  const direction = target.cx >= source.cx ? 1 : -1;
  const exitX = source.cx + (direction * source.width) / 2;
  const entryX = target.cx - (direction * target.width) / 2;
  const gap = Math.abs(entryX - exitX);

  if (gap < 2 * MIN_TURN_DISTANCE) {
    return null;
  }

  const low = Math.min(exitX, entryX);
  const high = Math.max(exitX, entryX);
  const spanLow = Math.min(source.cy, target.cy);
  const spanHigh = Math.max(source.cy, target.cy);

  // The nodes that stand in the way of the middle segment.
  const blocked = obstacles.filter((box) => {
    const bounds = edges(box);
    return bounds.bottom > spanLow && bounds.top < spanHigh;
  });

  let best: OrthogonalRoute | null = null;

  for (const turn of turnCandidates(low, high, blocked, 'x')) {
    const waypoints: Point[] = [
      { x: exitX, y: source.cy },
      { x: turn, y: source.cy },
      { x: turn, y: target.cy },
      { x: entryX, y: target.cy }
    ];

    const segments: Array<[Point, Point]> = [
      [waypoints[0], waypoints[1]],
      [waypoints[1], waypoints[2]],
      [waypoints[2], waypoints[3]]
    ];

    const crossings = countCrossings(segments, obstacles);
    const turnDistance = Math.abs(turn - exitX);

    const route: OrthogonalRoute = {
      waypoints,
      axis: 'horizontal',
      turnDistance,
      turnRatio: turnDistance / gap,
      crossings
    };

    if (best === null || isBetter(route, best)) {
      best = route;
    }

    if (crossings === 0) {
      break;
    }
  }

  return best;
}

/**
 * The route with the **vertical** primary axis: the relation leaves the
 * source up or down and enters the target up or down.
 */
function verticalRoute(
  source: Box,
  target: Box,
  obstacles: readonly Box[]
): OrthogonalRoute | null {
  const direction = target.cy >= source.cy ? 1 : -1;
  const exitY = source.cy + (direction * source.height) / 2;
  const entryY = target.cy - (direction * target.height) / 2;
  const gap = Math.abs(entryY - exitY);

  if (gap < 2 * MIN_TURN_DISTANCE) {
    return null;
  }

  const low = Math.min(exitY, entryY);
  const high = Math.max(exitY, entryY);
  const spanLow = Math.min(source.cx, target.cx);
  const spanHigh = Math.max(source.cx, target.cx);

  const blocked = obstacles.filter((box) => {
    const bounds = edges(box);
    return bounds.right > spanLow && bounds.left < spanHigh;
  });

  let best: OrthogonalRoute | null = null;

  for (const turn of turnCandidates(low, high, blocked, 'y')) {
    const waypoints: Point[] = [
      { x: source.cx, y: exitY },
      { x: source.cx, y: turn },
      { x: target.cx, y: turn },
      { x: target.cx, y: entryY }
    ];

    const segments: Array<[Point, Point]> = [
      [waypoints[0], waypoints[1]],
      [waypoints[1], waypoints[2]],
      [waypoints[2], waypoints[3]]
    ];

    const crossings = countCrossings(segments, obstacles);
    const turnDistance = Math.abs(turn - exitY);

    const route: OrthogonalRoute = {
      waypoints,
      axis: 'vertical',
      turnDistance,
      turnRatio: turnDistance / gap,
      crossings
    };

    if (best === null || isBetter(route, best)) {
      best = route;
    }

    if (crossings === 0) {
      break;
    }
  }

  return best;
}

/** Whether a route is better than another one. */
function isBetter(route: OrthogonalRoute, best: OrthogonalRoute): boolean {
  if (route.crossings !== best.crossings) {
    return route.crossings < best.crossings;
  }

  return routeLength(route.waypoints) < routeLength(best.waypoints);
}

/**
 * The route between two nodes, with right angles, that crosses the fewest
 * nodes.
 *
 * The route of a **self-relation** is empty: a relation whose two ends are
 * the same node is drawn as a loop by the canvas, and a path with waypoints
 * would be a mistake.
 */
export function routeOrthogonal(
  source: Box,
  target: Box,
  obstacles: readonly Box[]
): OrthogonalRoute {
  if (sameBox(source, target)) {
    return {
      waypoints: [],
      axis: 'horizontal',
      turnDistance: 0,
      turnRatio: 0,
      crossings: 0
    };
  }

  const blockers = obstacles.filter(
    (box) => !sameBox(box, source) && !sameBox(box, target)
  );

  const routes = [horizontalRoute(source, target, blockers), verticalRoute(source, target, blockers)]
    .filter((route): route is OrthogonalRoute => route !== null);

  if (routes.length === 0) {
    return {
      waypoints: [],
      axis: 'horizontal',
      turnDistance: 0,
      turnRatio: 0,
      crossings: 0
    };
  }

  return routes.reduce((best, route) => (isBetter(route, best) ? route : best));
}
