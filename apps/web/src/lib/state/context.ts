/**
 * The application state, handed to the tree through the Svelte context API.
 *
 * The state is **not** a module-level singleton: on the server a singleton
 * would leak one user's session and workspace into another user's request.
 * The root layout creates the instances and provides them here; every child
 * reads them with {@link getSessionState}, {@link getWorkspaceState} and
 * {@link getApiClient}.
 */

import { getContext, setContext } from 'svelte';
import type { ApiClient } from '$lib/api/client';
import type { LocaleState } from '$lib/i18n';
import type { SessionState } from './session.svelte';
import type { WorkspaceState } from './workspace.svelte';

export const SESSION_CONTEXT_KEY = Symbol.for('vozlab.web.session');
export const WORKSPACE_CONTEXT_KEY = Symbol.for('vozlab.web.workspace');
export const API_CLIENT_CONTEXT_KEY = Symbol.for('vozlab.web.api-client');
export const LOCALE_CONTEXT_KEY = Symbol.for('vozlab.web.locale');

export interface AppState {
  /** The in-memory session (access token + user). */
  readonly session: SessionState;
  /** The per-tab workspace state. */
  readonly workspace: WorkspaceState;
  /** The HTTP client, bound to the session and the workspace. */
  readonly api: ApiClient;
  /** The language of the interface. */
  readonly locale: LocaleState;
}

/**
 * Provides the application state to the current component tree.
 *
 * Must be called during the initialisation of the root layout.
 */
export function provideAppState(state: AppState): AppState {
  setContext(SESSION_CONTEXT_KEY, state.session);
  setContext(WORKSPACE_CONTEXT_KEY, state.workspace);
  setContext(API_CLIENT_CONTEXT_KEY, state.api);
  setContext(LOCALE_CONTEXT_KEY, state.locale);
  return state;
}

/** The in-memory session of the current request/tab. */
export function getSessionState(): SessionState {
  return getRequiredContext<SessionState>(SESSION_CONTEXT_KEY, 'session state');
}

/** The per-tab workspace state of the current request/tab. */
export function getWorkspaceState(): WorkspaceState {
  return getRequiredContext<WorkspaceState>(WORKSPACE_CONTEXT_KEY, 'workspace state');
}

/** The HTTP client of the current request/tab. */
export function getApiClient(): ApiClient {
  return getRequiredContext<ApiClient>(API_CLIENT_CONTEXT_KEY, 'API client');
}

/** The language of the interface of the current request/tab. */
export function getLocaleState(): LocaleState {
  return getRequiredContext<LocaleState>(LOCALE_CONTEXT_KEY, 'locale state');
}

function getRequiredContext<T>(key: symbol, name: string): T {
  const value = getContext<T>(key);
  if (value === undefined) {
    throw new Error(
      `[vozlab/web] The ${name} is missing from the Svelte context. ` +
        'Call provideAppState() in the root layout before reading it.'
    );
  }
  return value;
}
