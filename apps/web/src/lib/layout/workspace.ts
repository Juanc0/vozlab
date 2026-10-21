/**
 * The **workspace** of the graph.
 *
 * The graph page is not a page that scrolls: it is the window. The area
 * between the header of the shell and the bottom of the window is the
 * workspace, the canvas is that whole area and the panels **float** over
 * it.
 *
 * The paths that are a workspace are declared here, and the shell and the
 * layout of the application read the same list: the two of them have to
 * agree, or the graph page would scroll inside a shell that does not, or
 * the shell would be a window without a page in it.
 */

/** The paths whose page is a workspace. */
export const WORKSPACE_PATHS: readonly string[] = ['/'];

/**
 * Whether the path is a workspace.
 *
 * The path is compared **without** the trailing slash: the router may hand
 * over `/` and `/` alike.
 */
export function isWorkspacePath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  return WORKSPACE_PATHS.includes(path);
}
