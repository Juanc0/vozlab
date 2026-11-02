/**
 * The **force layout** of Cytoscape, registered for the comparison.
 *
 * `cytoscape-fcose` is a **development** dependency of the comparison: it
 * is a heavy library (the whole simulation of CoSE), and the app does not
 * need it — the graph of the app is arranged with `dagre`, deterministically.
 *
 * The extension is registered here, in the module the comparison imports
 * **dynamically**, so the library never reaches the bundle of the app: a
 * production build has no `fcose` layout and does not miss it.
 *
 * The registration is **global**, like the one of `dagre`: `cytoscape.use`
 * registers a layout by name, and the name is what a layout is asked for.
 * Registering it does not change the behaviour of `dagre`.
 */

import { cytoscape } from '$lib/graph/cytoscape-runtime';
import fcose from 'cytoscape-fcose';

/** Whether the extension has already been registered. */
let registered = false;

/**
 * Registers the force layout, once.
 *
 * The registration is a global one and it is idempotent: the comparison
 * mounts and unmounts, and the extension must not be registered twice.
 */
export function registerForceLayout(): void {
  if (registered) {
    return;
  }

  cytoscape.use(fcose);
  registered = true;
}
