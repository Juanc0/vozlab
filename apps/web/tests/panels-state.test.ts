/**
 * The state of the **panels**.
 *
 * Three panels fold: the navigation of the app, the inspector of the
 * workspace and the panel of the root picker. Their state is a preference
 * of the reader, and it lives in a **cookie** — never in `localStorage`,
 * never in `sessionStorage`.
 *
 * The cookie is read by the **server** (`hooks.server.ts`), so the first
 * paint is already the state the reader left behind: a navigation that
 * opens and closes again after the hydration is a flicker.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANEL_PREFERENCES,
  PANELS_COOKIE_NAME,
  PanelsState,
  parsePanelPreferences,
  serializePanelPreferences
} from '$lib/state/panels.svelte';

describe('the state of the panels', () => {
  it('starts with the inspector and the root picker folded', () => {
    // The walk through the graph happens without the inspector, and the
    // root picker is a control of the toolbar that opens it.
    expect(DEFAULT_PANEL_PREFERENCES.inspectorCollapsed).toBe(true);
    expect(DEFAULT_PANEL_PREFERENCES.rootCollapsed).toBe(true);

    // The navigation is a column until the reader folds it into its rail.
    expect(DEFAULT_PANEL_PREFERENCES.navCollapsed).toBe(false);
  });

  it('reads the cookie of the visitor', () => {
    const preferences = parsePanelPreferences(
      serializePanelPreferences({
        navCollapsed: true,
        inspectorCollapsed: false,
        rootCollapsed: true
      })
    );

    expect(preferences).toEqual({
      navCollapsed: true,
      inspectorCollapsed: false,
      rootCollapsed: true
    });
  });

  it('falls back to the default when the cookie says nothing', () => {
    // A cookie of an older version, a hand-edited one, a truncated one:
    // the interface must come up with its panels, never in an undefined
    // state.
    expect(parsePanelPreferences(undefined)).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences(null)).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences('')).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences('{broken')).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences('"a string"')).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(parsePanelPreferences('{"navCollapsed":"yes"}')).toEqual(DEFAULT_PANEL_PREFERENCES);
  });

  it('is kept in a cookie and never in the storage of the browser', () => {
    const panels = new PanelsState();

    panels.toggleNav();
    panels.setInspectorCollapsed(false);
    panels.setRootCollapsed(false);

    expect(document.cookie).toContain(PANELS_COOKIE_NAME);
    expect(document.cookie).toContain('navCollapsed');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('carries the three flags in the cookie', () => {
    const panels = new PanelsState({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: false
    });

    expect(panels.preferences).toEqual({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: false
    });

    panels.setRootCollapsed(true);

    const written = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${PANELS_COOKIE_NAME}=`));

    expect(written).toBeDefined();

    const value = decodeURIComponent((written ?? '').split('=')[1] ?? '');

    expect(parsePanelPreferences(value)).toEqual({
      navCollapsed: true,
      inspectorCollapsed: true,
      rootCollapsed: true
    });
  });
});
