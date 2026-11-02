/**
 * The ambient declaration of `cytoscape-fcose`.
 *
 * The extension ships no types of its own, and the comparison of the
 * engines is the only thing that uses it: the declaration lives **next to
 * the development surface**, not in the ambient file of the app, so the
 * types of the extension are only here.
 *
 * This file must stay a *global script* (no top-level `import`/`export`),
 * otherwise TypeScript treats `declare module` as an augmentation of an
 * existing module.
 */
declare module 'cytoscape-fcose' {
  import type { cytoscape } from 'cytoscape';

  /**
   * The extension of Cytoscape.
   *
   * It is registered with `cytoscape.use(fcose)`, exactly like `dagre`.
   */
  const fcose: (cy: typeof cytoscape) => void;

  export default fcose;
}
