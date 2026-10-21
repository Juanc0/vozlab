/**
 * The Cytoscape runtime, shared by every canvas of the app.
 *
 * This module is imported **dynamically**, from the browser only: Cytoscape
 * draws to a `<canvas>`, so the server pass must never evaluate it. The
 * `dagre` layout is registered **once, at module level** — `cytoscape.use` is
 * a global registration, not something to repeat on every render.
 *
 * Every canvas of the app imports Cytoscape from here, so the extension is
 * registered once and only once, no matter how many canvases are mounted.
 */

import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

/** Registered once, at module level: the layout the canvas draws with. */
cytoscape.use(dagre);

export { cytoscape };
export { default as dagre } from 'cytoscape-dagre';
