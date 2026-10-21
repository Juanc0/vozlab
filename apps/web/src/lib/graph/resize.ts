/**
 * The observer of the size of the container of a canvas.
 *
 * Cytoscape draws to a `<canvas>`: it knows the size of its container only
 * when it is told. A window that is resized, a panel that opens, a keyboard
 * that comes up on a phone — the picture stays at the old size and part of
 * it is cut off.
 *
 * The observer **redraws** the picture and nothing else: it never re-fits
 * the viewport and never runs the layout. A graph that is re-fitted moves
 * under the reader's feet, and the place the user put a node is lost. The
 * picture has to stay where the user left it.
 */

/**
 * Watches the size of a container.
 *
 * It answers the function that stops the observation: the caller has to
 * stop it when the canvas is destroyed, exactly like the instance itself.
 */
export function observeContainerSize(
  container: HTMLElement,
  onResize: () => void
): () => void {
  // A DOM without the observer (jsdom among them) simply does not redraw:
  // the canvas keeps the size it was given.
  if (typeof ResizeObserver === 'undefined') {
    return () => {};
  }

  const observer = new ResizeObserver(() => {
    onResize();
  });

  observer.observe(container);

  return () => {
    observer.disconnect();
  };
}
