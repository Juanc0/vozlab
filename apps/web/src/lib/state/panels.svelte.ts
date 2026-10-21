/**
 * The state of the **panels** of the application.
 *
 * Three panels fold: the navigation of the app, the inspector of the
 * workspace and the panel of the root picker. Their state is a **preference**
 * of the reader, and it is kept in a **cookie** (`vozlab_panels`), never in
 * `localStorage` and never in `sessionStorage`:
 *
 * - the cookie travels to the server, so the **first paint** is already the
 *   state the reader left behind — there is no flash of a panel that opens
 *   and closes again;
 * - the cookie is not a secret: how the panels are folded is a preference,
 *   and a preference belongs to the browser, not to the session.
 *
 * The precedent is the language (`vozlab_locale`): the `handle` hook of the
 * server reads the cookie, the layout hands the value to the state, and the
 * state writes the cookie back when the reader folds something.
 *
 * The state is **not** a module-level singleton: on the server a singleton
 * would leak the panels of one visitor into the answer of another one. The
 * root layout creates the instance and provides it through the context.
 */

/** The name of the cookie that carries the state of the panels. */
export const PANELS_COOKIE_NAME = 'vozlab_panels';

/** How long the preference of the panels is kept. */
const PANELS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The state of the three panels.
 *
 * A flag says the panel is **collapsed**, so the default of the interface is
 * the one the reader asked for:
 *
 * - the navigation is a **column** until it is folded into its rail;
 * - the inspector is **collapsed**: the walk through the graph happens
 *   without it, and the reader turns it on;
 * - the panel of the root picker is **collapsed**: it is a control in the
 *   toolbar that opens it.
 */
export interface PanelPreferences {
  /** `true` when the navigation is folded into its rail of icons. */
  readonly navCollapsed: boolean;
  /** `true` when the inspector is folded away. */
  readonly inspectorCollapsed: boolean;
  /** `true` when the panel of the root picker is folded away. */
  readonly rootCollapsed: boolean;
}

/** The state of the panels when the reader has never said anything. */
export const DEFAULT_PANEL_PREFERENCES: PanelPreferences = {
  navCollapsed: false,
  inspectorCollapsed: true,
  rootCollapsed: true
};

/** A boolean of the cookie, or the default when it is not one. */
function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * The state of the panels a cookie carries.
 *
 * An unknown value — a cookie of an older version, a hand-edited one, a
 * truncated one — falls back to the default: the interface must come up with
 * its panels, never in an undefined state.
 */
export function parsePanelPreferences(raw: string | undefined | null): PanelPreferences {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return DEFAULT_PANEL_PREFERENCES;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PANEL_PREFERENCES;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_PANEL_PREFERENCES;
  }

  const record = parsed as Record<string, unknown>;

  return {
    navCollapsed: flag(record['navCollapsed'], DEFAULT_PANEL_PREFERENCES.navCollapsed),
    inspectorCollapsed: flag(
      record['inspectorCollapsed'],
      DEFAULT_PANEL_PREFERENCES.inspectorCollapsed
    ),
    rootCollapsed: flag(record['rootCollapsed'], DEFAULT_PANEL_PREFERENCES.rootCollapsed)
  };
}

/** The state of the panels, as the cookie carries it. */
export function serializePanelPreferences(preferences: PanelPreferences): string {
  return JSON.stringify({
    navCollapsed: preferences.navCollapsed,
    inspectorCollapsed: preferences.inspectorCollapsed,
    rootCollapsed: preferences.rootCollapsed
  });
}

/**
 * Writes the state of the panels in the cookie.
 *
 * The cookie is **not** `HttpOnly`: the browser writes it when the reader
 * folds a panel, and the server reads it to render the first paint.
 */
export function writePanelsCookie(preferences: PanelPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie =
    `${PANELS_COOKIE_NAME}=${encodeURIComponent(serializePanelPreferences(preferences))}` +
    `; path=/; max-age=${PANELS_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * The state of the panels of the current request or tab.
 *
 * The instance is created per request on the server and per tab in the
 * browser; it is handed to the tree through the Svelte context API.
 */
export class PanelsState {
  /** `true` while the navigation is a rail of icons. */
  navCollapsed = $state(DEFAULT_PANEL_PREFERENCES.navCollapsed);

  /** `true` while the inspector is folded away. */
  inspectorCollapsed = $state(DEFAULT_PANEL_PREFERENCES.inspectorCollapsed);

  /** `true` while the panel of the root picker is folded away. */
  rootCollapsed = $state(DEFAULT_PANEL_PREFERENCES.rootCollapsed);

  constructor(initial: PanelPreferences = DEFAULT_PANEL_PREFERENCES) {
    this.navCollapsed = initial.navCollapsed;
    this.inspectorCollapsed = initial.inspectorCollapsed;
    this.rootCollapsed = initial.rootCollapsed;
  }

  /** The state of the three panels, as the cookie carries it. */
  get preferences(): PanelPreferences {
    return {
      navCollapsed: this.navCollapsed,
      inspectorCollapsed: this.inspectorCollapsed,
      rootCollapsed: this.rootCollapsed
    };
  }

  /** Folds the navigation into its rail, or unfolds it. */
  toggleNav(): void {
    this.setNavCollapsed(!this.navCollapsed);
  }

  /** Folds the navigation into its rail, or unfolds it. */
  setNavCollapsed(collapsed: boolean): void {
    this.navCollapsed = collapsed;
    this.#persist();
  }

  /** Folds the inspector away, or opens it. */
  setInspectorCollapsed(collapsed: boolean): void {
    this.inspectorCollapsed = collapsed;
    this.#persist();
  }

  /** Folds the panel of the root picker away, or opens it. */
  setRootCollapsed(collapsed: boolean): void {
    this.rootCollapsed = collapsed;
    this.#persist();
  }

  /** Writes the state of the panels in the cookie. */
  #persist(): void {
    writePanelsCookie(this.preferences);
  }
}
