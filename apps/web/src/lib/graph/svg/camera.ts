/**
 * The **camera** of the SVG painter — the fit and the zoom.
 *
 * A painter that owns its SVG owns its viewport too: the zoom is a
 * transform of the drawing, not a property of a canvas library. The two
 * questions the painter asks are here, **pure** and tested:
 *
 * - where does the picture have to sit so that all of it is in view? (the
 *   fit, the zoom the view opens with);
 * - when the reader turns the wheel over a point, how does the transform
 *   change without the point under the pointer moving?
 *
 * The range is the one of the app (`$lib/graph/explore/zoom`): a twentieth
 * at the bottom, three times at the top. The two painters share it.
 */

import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom } from '$lib/graph/explore/zoom';

/** The room the picture keeps around itself when it is fitted, in pixels. */
export const FIT_PADDING = 30;

/** A transform of the drawing: the camera of d3-zoom. */
export interface CameraTransform {
  /** The horizontal translation, in screen pixels. */
  readonly x: number;
  /** The vertical translation, in screen pixels. */
  readonly y: number;
  /** The zoom. */
  readonly k: number;
}

/** The box the picture occupies, in the coordinates of the drawing. */
export interface PictureBounds {
  /** The smallest x of the picture. */
  readonly minX: number;
  /** The smallest y of the picture. */
  readonly minY: number;
  /** The biggest x of the picture. */
  readonly maxX: number;
  /** The biggest y of the picture. */
  readonly maxY: number;
}

/** The size of the space the picture is drawn in. */
export interface ViewportSize {
  /** The width of the space, in pixels. */
  readonly width: number;
  /** The height of the space, in pixels. */
  readonly height: number;
}

/** The camera the view opens with: the picture at its own scale, centred. */
export const IDENTITY: CameraTransform = { x: 0, y: 0, k: 1 };

/**
 * Fits a picture in a viewport.
 *
 * The zoom is the one that puts the whole picture inside the space, with
 * {@link FIT_PADDING} of air, and the translation centres it. The zoom is
 * clamped to the range of the reader, so a picture of two hundred cards is
 * not fitted below a twentieth.
 *
 * @param bounds - The box of the picture.
 * @param viewport - The size of the space.
 * @param padding - The air around the picture, in pixels.
 * @returns The transform of the fit.
 */
export function fitTransform(
  bounds: PictureBounds,
  viewport: ViewportSize,
  padding = FIT_PADDING
): CameraTransform {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const pictureWidth = Math.max(1, bounds.maxX - bounds.minX);
  const pictureHeight = Math.max(1, bounds.maxY - bounds.minY);

  const k = clampZoom(
    Math.min(
      (width - padding * 2) / pictureWidth,
      (height - padding * 2) / pictureHeight
    )
  );

  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: width / 2 - centreX * k,
    y: height / 2 - centreY * k,
    k
  };
}

/**
 * Zooms around a point of the screen.
 *
 * The point is the one under the pointer, and it **stays** under it: the
 * translation is corrected by the difference the zoom would have moved it.
 * It is what `d3-zoom` does with the wheel, written down so the rule can be
 * tested without a browser.
 *
 * @param transform - The camera before the zoom.
 * @param point - The point of the screen the reader points at.
 * @param factor - How much the zoom changes.
 * @returns The camera after the zoom, inside the range of the reader.
 */
export function zoomAt(
  transform: CameraTransform,
  point: { readonly x: number; readonly y: number },
  factor: number
): CameraTransform {
  const k = clampZoom(transform.k * factor);

  if (k === transform.k) {
    return transform;
  }

  const ratio = k / transform.k;

  return {
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
    k
  };
}

/**
 * The point of the drawing under a point of the screen.
 *
 * @param transform - The camera.
 * @param point - The point of the screen.
 * @returns The point of the drawing.
 */
export function toWorld(
  transform: CameraTransform,
  point: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } {
  return {
    x: (point.x - transform.x) / transform.k,
    y: (point.y - transform.y) / transform.k
  };
}

/**
 * The point of the screen a point of the drawing is drawn at.
 *
 * @param transform - The camera.
 * @param point - The point of the drawing.
 * @returns The point of the screen.
 */
export function toScreen(
  transform: CameraTransform,
  point: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } {
  return {
    x: point.x * transform.k + transform.x,
    y: point.y * transform.k + transform.y
  };
}

/** The ends of the range, re-exported so the painter imports one module. */
export { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom };
