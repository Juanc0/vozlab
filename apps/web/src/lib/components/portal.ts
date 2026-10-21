/**
 * The portal of the modal panels.
 *
 * A panel that covers the content must be a **sibling** of the content and
 * not a child of it: the background of a modal is inert, and a background
 * that holds the modal is not inert at all.
 *
 * The action moves the node to the body, where the rest of the application
 * is a sibling of it, and the panel can therefore mark the background as
 * inert without marking itself.
 */

/**
 * Moves a node to the body.
 *
 * The node is removed from the body when the action is destroyed: the panel
 * is mounted and unmounted with the state that shows it, and a node that
 * stayed in the body would be a panel nobody can close.
 */
export function portal(node: HTMLElement): { destroy: () => void } {
  document.body.appendChild(node);

  return {
    destroy() {
      node.remove();
    }
  };
}
