/**
 * The **frame time** of an engine.
 *
 * The comparison answers a question with numbers: how long a frame takes in
 * each engine, and how long the layout takes to settle.
 *
 * The frame time is measured the way a reader would feel it: the picture
 * is asked to move — a wheel over the canvas — and the time between the
 * frames is recorded. The panels are measured **one after the other**, so
 * the picture that moves is the only one that costs anything, and the
 * frame that is measured belongs to the engine under test.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

/** What a measurement of the frames says. */
export interface FrameSummary {
  /** How many frames were measured. */
  readonly frames: number;
  /** The average of the frames, in milliseconds. */
  readonly mean: number;
  /** The frame in the middle of the measurement, in milliseconds. */
  readonly median: number;
  /** The slowest frame, in milliseconds. */
  readonly max: number;
  /** The fastest frame, in milliseconds. */
  readonly min: number;
}

/**
 * The number of frames of a measurement.
 *
 * The first ones are **warm-up**: the first wheel over a canvas makes the
 * engine build what it had not built yet, and that frame says nothing
 * about the engine.
 */
const WARMUP_FRAMES = 5;

/** How many frames a measurement takes. */
const MEASURED_FRAMES = 30;

/**
 * Measures the frames of a picture.
 *
 * @param element - The element the picture is drawn in.
 * @param frames - How many frames to measure.
 * @returns The time between the frames, in milliseconds.
 */
export async function measureFrames(
  element: HTMLElement,
  frames = MEASURED_FRAMES
): Promise<number[]> {
  const canvases = [...element.querySelectorAll('canvas')];
  const canvas = canvases[0];

  if (canvas === undefined) {
    return [];
  }

  const deltas: number[] = [];
  let last = performance.now();

  await new Promise<void>((resolve) => {
    let count = 0;

    const step = (): void => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;

      const bounds = canvas.getBoundingClientRect();

      // The wheel over the canvas: the engine moves the picture, and the
      // frame it takes to draw it is the frame that is measured.
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -120,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
          bubbles: true,
          cancelable: true
        })
      );

      count += 1;

      if (count >= frames + WARMUP_FRAMES) {
        resolve();
        return;
      }

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });

  return deltas.slice(WARMUP_FRAMES);
}

/**
 * Summarizes the times between the frames.
 *
 * @param deltas - The times between the frames, in milliseconds.
 * @returns The summary of the measurement.
 */
export function summarizeFrames(deltas: readonly number[]): FrameSummary {
  if (deltas.length === 0) {
    return { frames: 0, mean: 0, median: 0, max: 0, min: 0 };
  }

  const sorted = [...deltas].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(sorted.length / 2);

  return {
    frames: sorted.length,
    mean: total / sorted.length,
    median:
      sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : (sorted[middle] ?? 0),
    max: sorted[sorted.length - 1] ?? 0,
    min: sorted[0] ?? 0
  };
}
