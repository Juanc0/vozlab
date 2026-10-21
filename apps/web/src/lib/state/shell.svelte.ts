/**
 * The state of the shell.
 *
 * It holds the panels of the responsive layout that the shell itself
 * opens: the drawer of the navigation.
 *
 * The state is a module-level singleton, and it is safe: it holds **no user
 * data**. The server always renders the neutral state (the drawer is
 * closed), because the state is only ever changed by a click of the
 * visitor — a request can therefore never see another visitor's drawer.
 * (The session and the workspace are the states that must not be shared,
 * and they live in the context.)
 */
class ShellState {
  /** `true` while the drawer of the navigation is open. */
  navOpen = $state(false);

  /** Opens the drawer of the navigation. */
  openNav(): void {
    this.navOpen = true;
  }

  /** Closes the drawer of the navigation. */
  closeNav(): void {
    this.navOpen = false;
  }

  /** Opens the drawer when it is closed, and closes it when it is open. */
  toggleNav(): void {
    this.navOpen = !this.navOpen;
  }
}

export const shellState = new ShellState();
