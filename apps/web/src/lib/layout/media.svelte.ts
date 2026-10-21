/**
 * The width of the window, as the interface sees it.
 *
 * The layout is **mobile first**: the base styles are the ones of a phone
 * and the breakpoints add the columns. Two of the pieces of the interface
 * change with the width — the navigation is a column above `md` and a
 * drawer below it, and the inspector is a column above `xl` and a sheet
 * below it.
 *
 * The state is read from a media query and it follows the changes of the
 * window: a window that is resized changes the layout with it.
 *
 * The **default is the wide layout**: the server renders the columns, and
 * the browser corrects the layout as soon as it knows the width. The
 * columns are the ones that do not hide anything: a narrow screen that
 * receives the wide layout sees the content in a single column, while a
 * wide screen that receives the narrow one would not see the navigation at
 * all.
 */
export class MediaQuery {
  /** `true` while the query of the window matches. */
  matches = $state(true);

  readonly #query: string;

  #list: MediaQueryList | null = null;

  /** The change of the list: the layout follows the window. */
  readonly #update = (event: MediaQueryListEvent): void => {
    this.matches = event.matches;
  };

  constructor(query: string) {
    this.#query = query;
  }

  /**
   * Starts to follow the width of the window.
   *
   * The list is read once and then it reports its own changes: the layout
   * follows the window without asking it again on every frame.
   */
  attach(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const list = window.matchMedia(this.#query);
    this.#list = list;
    this.matches = list.matches;

    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', this.#update);
    } else {
      // The old Safari only knows the deprecated API.
      list.addListener(this.#update);
    }
  }

  /** Stops following the width of the window. */
  destroy(): void {
    const list = this.#list;

    if (list === null) {
      return;
    }

    if (typeof list.removeEventListener === 'function') {
      list.removeEventListener('change', this.#update);
    } else {
      list.removeListener(this.#update);
    }

    this.#list = null;
  }
}
