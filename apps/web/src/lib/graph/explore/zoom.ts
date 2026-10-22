/**
 * The **zoom** of the picture.
 *
 * The zoom is a property of the **view**, and the view belongs to the
 * reader: it starts at the **fit** — the whole graph in view — and the
 * wheel (the pinch, the controls of the toolbar) changes it. Walking does
 * not touch it: a walk moves the **picture**, not the zoom.
 *
 * The two ends of the range are written down here, with the reason:
 *
 * - the **floor** is a twentieth. The API caps a window at two hundred
 *   nodes, and two hundred cards do not fit in a canvas at a zoom where
 *   their titles can be read: the fit of that picture is under a tenth, and
 *   a reader who wants the whole graph at once must be able to have it.
 * - the **ceiling** is three. The title of a card is twelve pixels, and at
 *   three times it is thirty-six: past that the picture is a wall of
 *   cards, not a picture of a graph.
 *
 * Pure: no DOM, no Cytoscape, no state.
 */

/**
 * The smallest zoom the reader can have.
 *
 * It is a twentieth: the fit of a picture of two hundred cards is under a
 * tenth, and the reader has to be able to see the whole graph at once.
 */
export const MIN_ZOOM = 0.05;

/**
 * The biggest zoom the reader can have.
 *
 * It is three: the title of a card is twelve pixels, and at three times it
 * is a title the reader can read from across the room — and no more.
 */
export const MAX_ZOOM = 3;

/**
 * The factor of one step of the zoom controls.
 *
 * It is a fifth more: a step that is too small is a click that does not
 * seem to do anything, and a step that is too big loses the place the
 * reader was looking at.
 */
export const ZOOM_STEP = 1.2;

/**
 * Puts a zoom inside the range of the reader.
 *
 * A zoom that is not a number — `NaN`, `Infinity` — is not a zoom: it is
 * the floor, because a picture that cannot be read is worse than a small
 * one.
 *
 * @param zoom - The zoom to put inside the range.
 * @returns The zoom, inside the range.
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return MIN_ZOOM;
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * What the reader asked the zoom to do.
 *
 * The three actions are the three buttons of the toolbar: come closer, go
 * away, and put the whole picture in view.
 */
export type ZoomAction = 'in' | 'out' | 'fit';

/**
 * Who changed the zoom.
 *
 * - `reader`: the wheel, the pinch or the controls of the toolbar. The
 *   value is **the reader's**, and it survives everything: the growth of
 *   the picture, a walk and the change of the mode of the graph.
 * - `view`: the picture was fitted — the view opened, or the reader asked
 *   for the fit. It is the zoom the picture starts with, not a choice.
 */
export type ZoomSource = 'reader' | 'view';

/**
 * A command of the zoom.
 *
 * The **request** is a counter, and it is what tells a command from the
 * one before it: the reader may ask for the same thing twice, and the
 * second time is a second command.
 */
export interface ZoomCommand {
  /** What the reader asked for. */
  readonly action: ZoomAction;
  /** The number of the command. */
  readonly request: number;
}
