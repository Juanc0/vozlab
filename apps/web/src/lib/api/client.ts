/**
 * The HTTP client.
 *
 * Every call carries the three headers the API expects:
 *
 * ```http
 * Authorization: Bearer <access token>
 * X-Workspace-ID: <active workspace uuid>
 * x-correlation-id: <uuid>
 * ```
 *
 * `x-correlation-id` is the header Fastify reads (`requestIdHeader:
 * 'x-correlation-id'`) and echoes back as `X-Request-ID`.
 *
 * `credentials: 'include'` lets the `HttpOnly` refresh cookie travel to
 * `/api/v1/auth/*`; the cookie is scoped to that path, so it is never
 * replayed against the graph routes.
 */

import { apiUrl } from '$lib/config/api-base-url';
import { runUnderRefreshLock } from '$lib/api/refresh-lock';
import type { SessionState } from '$lib/state/session.svelte';
import type { WorkspaceState } from '$lib/state/workspace.svelte';
import {
  ApiError,
  fallbackCodeForStatus,
  fallbackMessageForStatus,
  type ApiErrorCode,
  type ApiErrorIssue
} from './errors';

/** The HTTP verbs the API exposes. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A value that can be sent as a query parameter. */
export type QueryValue = string | number | boolean | null | undefined;

/** The resource key of a keyset-paginated list. */
export type CursorResourceKey = 'nodes' | 'edges' | 'proposals' | 'threads' | 'posts';

/** One page of a keyset-paginated list. */
export interface CursorPage<T> {
  /** The items of this page. */
  readonly items: T[];
  /** The opaque cursor of the next page, or `null` on the last page. */
  readonly nextCursor: string | null;
}

export interface ApiRequestInit {
  /** Defaults to `GET`. */
  method?: HttpMethod;
  /** Path relative to the API base URL, e.g. `/nodes`. */
  path: string;
  /** Query parameters; `null` and `undefined` values are dropped. */
  query?: Record<string, QueryValue>;
  /** JSON body. When present, `Content-Type: application/json` is sent. */
  body?: unknown;
  /**
   * `'none'` omits the `Authorization` header (public auth routes).
   * Defaults to `'bearer'`.
   */
  auth?: 'bearer' | 'none';
  /**
   * `false` omits the `X-Workspace-ID` header — for the routes where the
   * workspace is the answer and not an input (`GET /auth/me`).
   * Defaults to `true`.
   */
  workspace?: boolean;
  /** Aborts the request. */
  signal?: AbortSignal;
  /** Extra headers. The mandatory headers above always win. */
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /**
   * The base URL of the API, e.g. `http://localhost:3000/api/v1`.
   *
   * A getter may be passed instead of a string: the client then resolves the
   * base URL on every request and stays in sync with a runtime
   * configuration that is re-pointed after the app was loaded.
   */
  baseUrl: string | (() => string);
  /** The in-memory session (access token). */
  session: SessionState;
  /** The per-tab workspace state. */
  workspace: WorkspaceState;
}

/**
 * Creates a correlation id.
 *
 * Uses `crypto.randomUUID()` when it is available and falls back to
 * `crypto.getRandomValues()` (and finally to `Math.random`) so the header is
 * always a well-formed UUID.
 */
export function createCorrelationId(): string {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

/** Builds the query string of a request (`''` when there is none). */
export function buildQueryString(query?: Record<string, QueryValue>): string {
  if (!query) {
    return '';
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.set(key, String(value));
  }
  return params.toString();
}

/** The `limit`/`cursor` parameters of a keyset-paginated list. */
export function cursorQuery(limit?: number, cursor?: string | null): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};
  if (typeof limit === 'number') {
    query.limit = limit;
  }
  if (cursor) {
    query.cursor = cursor;
  }
  return query;
}

export class ApiClient {
  readonly session: SessionState;
  readonly workspace: WorkspaceState;

  #baseUrl: string | (() => string);

  /**
   * The refresh that is currently in flight in this client, if any.
   *
   * The refresh cookie is shared by every tab of the origin while the
   * access token is per tab, and the API reads a second presentation of an
   * already-rotated cookie as a theft. Two concurrent refreshes would
   * therefore log the tab out. The in-flight promise is shared instead — see
   * {@link serializeRefresh}.
   */
  #refreshInFlight: Promise<unknown> | null = null;

  constructor(options: ApiClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.session = options.session;
    this.workspace = options.workspace;
  }

  /**
   * Runs `operation` with the refresh serialised.
   *
   * Concurrent callers in the same client share the **same** promise and
   * therefore the same result; a caller in another tab waits for the
   * origin-scoped lock and then runs its own operation against the rotated
   * cookie.
   */
  serializeRefresh<T>(operation: () => Promise<T>): Promise<T> {
    const inFlight = this.#refreshInFlight;
    if (inFlight !== null) {
      return inFlight as Promise<T>;
    }

    const promise = runUnderRefreshLock(operation);
    this.#refreshInFlight = promise;

    // The slot is released as soon as the operation settles. The reaction is
    // registered **before** the caller's own continuation runs, so a caller
    // that awaits the refresh and then asks for another one gets a new
    // refresh rather than the finished one.
    const release = (): void => {
      if (this.#refreshInFlight === promise) {
        this.#refreshInFlight = null;
      }
    };
    promise.then(release, release);

    return promise;
  }

  /** The API base URL the client talks to. */
  get baseUrl(): string {
    return typeof this.#baseUrl === 'function' ? this.#baseUrl() : this.#baseUrl;
  }

  /** The absolute URL of an API path (without query string). */
  url(path: string): string {
    return apiUrl(this.baseUrl, path);
  }

  /**
   * Performs a request and parses the JSON body.
   *
   * A non-2xx response is turned into an {@link ApiError} carrying the API
   * envelope (`code`, `message`); the raw HTTP text is never surfaced.
   */
  async request<T>(init: ApiRequestInit): Promise<T> {
    const response = await this.fetch(init);

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return (await parseBody<T>(response)) as T;
  }

  /** Performs a request that answers with an empty body (`204`). */
  async requestVoid(init: ApiRequestInit): Promise<void> {
    const response = await this.fetch(init);

    if (!response.ok) {
      throw await this.toApiError(response);
    }
  }

  /**
   * Performs a request against a keyset-paginated list.
   *
   * The API answers with the resource key plus the opaque `nextCursor`
   * (`{ "nodes": [...], "nextCursor": "…" }`); the cursor can be passed back
   * as the `cursor` query parameter.
   */
  async page<T>(init: ApiRequestInit & { resourceKey: CursorResourceKey }): Promise<CursorPage<T>> {
    const body = await this.request<Record<string, unknown>>(init);
    const raw = body?.[init.resourceKey];

    return {
      items: Array.isArray(raw) ? (raw as T[]) : [],
      nextCursor: typeof body?.nextCursor === 'string' && body.nextCursor !== '' ? body.nextCursor : null
    };
  }

  private async fetch(init: ApiRequestInit): Promise<Response> {
    const hasBody = init.body !== undefined && init.body !== null;

    return fetch(this.buildUrl(init), {
      method: init.method ?? 'GET',
      headers: this.buildHeaders(init, hasBody),
      body: hasBody ? JSON.stringify(init.body) : undefined,
      // The refresh cookie is `HttpOnly` and scoped to `/api/v1/auth`.
      credentials: 'include',
      signal: init.signal
    });
  }

  private buildUrl(init: ApiRequestInit): string {
    const url = this.url(init.path);
    const query = buildQueryString(init.query);
    if (query === '') {
      return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
  }

  private buildHeaders(init: ApiRequestInit, hasBody: boolean): Headers {
    const headers = new Headers();

    for (const [key, value] of Object.entries(init.headers ?? {})) {
      headers.set(key, value);
    }

    headers.set('x-correlation-id', createCorrelationId());

    if (init.auth !== 'none') {
      const token = this.session.accessToken;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    if (init.workspace !== false) {
      const workspaceId = this.workspace.currentWorkspaceId;
      if (workspaceId !== '') {
        headers.set('X-Workspace-ID', workspaceId);
      }
    }

    // Only a request that actually carries a body announces a content type.
    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }

  /**
   * Turns a failed response into an {@link ApiError} and applies the
   * session/workspace consequences of the status.
   */
  private async toApiError(response: Response): Promise<ApiError> {
    const error = await readApiError(response);

    if (response.status === 401) {
      // The access token is gone: the session is over.
      this.session.clear();
    }

    if (response.status === 403 && error.code === 'ERR_UNAUTHORIZED_WORKSPACE_ACCESS') {
      // The active workspace is no longer permitted: fall back to one the
      // user is still a member of.
      this.workspace.switchToPermittedWorkspace();
    }

    return error;
  }
}

/** Parses a successful response body; `undefined` for an empty body. */
async function parseBody<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (text.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      status: response.status,
      code: 'ERR_INTERNAL_SERVER_ERROR',
      message: 'The API answered with a body that is not valid JSON.'
    });
  }
}

/** Reads the API error envelope of a failed response. */
async function readApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return ApiError.fromStatus(response.status);
  }

  if (typeof body !== 'object' || body === null) {
    return ApiError.fromStatus(response.status);
  }

  const envelope = body as Record<string, unknown>;
  const code = typeof envelope.code === 'string' && envelope.code !== '' ? envelope.code : null;
  const message = typeof envelope.message === 'string' && envelope.message !== '' ? envelope.message : null;

  if (code === null && message === null) {
    return ApiError.fromStatus(response.status);
  }

  const errorCode: ApiErrorCode = code ?? fallbackCodeForStatus(response.status);

  return new ApiError({
    status: response.status,
    code: errorCode,
    message: message ?? fallbackMessageForStatus(response.status),
    issues: readIssues(envelope.issues)
  });
}

/** Normalises the `issues` array of a `422` validation failure. */
function readIssues(raw: unknown): ApiErrorIssue[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const issues: ApiErrorIssue[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const issue = entry as Record<string, unknown>;
    const path = Array.isArray(issue.path)
      ? issue.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      : [];

    issues.push({
      path,
      message: typeof issue.message === 'string' ? issue.message : 'Invalid value.',
      code: typeof issue.code === 'string' ? issue.code : undefined
    });
  }

  return issues;
}
