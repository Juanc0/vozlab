/**
 * The **settle** of a force layout.
 *
 * A force layout is a simulation: it moves the nodes until they find their
 * place, and then it must **stop**. A simulation that never stops burns the
 * battery of the reader and never lets the picture rest.
 *
 * The watcher is the shared rule of the two springs of the comparison: it
 * watches how far the picture moved in the last step, and when the picture
 * moves less than a pixel and a half for a few steps in a row, the picture
 * has **settled** — and the simulation is stopped.
 *
 * The module is **dev-only**: it belongs to the comparison of the engines.
 */

/** How a watcher is built. */
export interface SettleOptions {
  /**
   * How far the picture may move and still be said to have moved, in pixels.
   *
   * It is a pixel and a half: below it the picture is at rest.
   */
  readonly threshold?: number;
  /**
   * How many quiet steps in a row settle the picture.
   *
   * One quiet step is not enough: a simulation can have a moment of calm
   * before it moves again.
   */
  readonly quietSteps?: number;
  /** Stops the simulation. */
  readonly stop: () => void;
}

/** The watcher of a settle. */
export interface SettleWatcher {
  /**
   * Feeds the movement of a step to the watcher.
   *
   * @param movement - The distance the picture moved, in pixels.
   * @returns Whether the picture has settled.
   */
  step(movement: number): boolean;
  /** Stops the watcher and the simulation. */
  stop(): void;
  /** Whether the picture has settled. */
  readonly settled: boolean;
  /** How many steps the watcher has seen. */
  readonly steps: number;
}

/** The movement below which the picture is at rest, in pixels. */
export const SETTLE_THRESHOLD = 1.5;

/** How many quiet steps in a row settle the picture. */
export const SETTLE_QUIET_STEPS = 3;

/**
 * Creates the watcher of a settle.
 *
 * The watcher calls `stop` **once**, when the picture settles: the
 * simulation is stopped by the code that watches it, and not by the
 * simulation itself.
 */
export function createSettleWatcher(options: SettleOptions): SettleWatcher {
  const threshold = options.threshold ?? SETTLE_THRESHOLD;
  const quietSteps = options.quietSteps ?? SETTLE_QUIET_STEPS;

  let quiet = 0;
  let settled = false;
  let steps = 0;

  return {
    step(movement: number): boolean {
      steps += 1;

      if (settled) {
        return true;
      }

      if (movement < threshold) {
        quiet += 1;
      } else {
        quiet = 0;
      }

      if (quiet < quietSteps) {
        return false;
      }

      settled = true;
      options.stop();

      return true;
    },

    stop(): void {
      if (settled) {
        return;
      }

      settled = true;
      options.stop();
    },

    get settled(): boolean {
      return settled;
    },

    get steps(): number {
      return steps;
    }
  };
}
