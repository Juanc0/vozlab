/**
 * The starting places of the force layout.
 */

/** A point in the plane. */
export interface Point {
  x: number;
  y: number;
}

export function seedCirclePositions(count: number, radius = 220): Point[] {
  const positions: Point[] = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / Math.max(1, count);

    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }

  return positions;
}
