/**
 * Runtime configuration of the API endpoint.
 *
 * The base URL is resolved **on the server** from `PUBLIC_API_BASE_URL`
 * (`$env/dynamic/public`), so a container image can be re-pointed at another
 * API without rebuilding the bundle.
 */

/** Local development default — the Fastify API listens on port 3000. */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * Normalises a configured API base URL.
 *
 * - blank / missing values fall back to {@link DEFAULT_API_BASE_URL};
 * - values that are not absolute `http(s)` URLs are rejected (a relative URL
 *   would silently resolve against the app origin);
 * - trailing slashes are removed so path joining stays predictable.
 */
export function normalizeApiBaseUrl(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    return DEFAULT_API_BASE_URL;
  }

  // Allow relative paths (e.g. '/api/v1') so the API resolves against
  // the current origin — useful behind a reverse proxy / tunnel.
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return DEFAULT_API_BASE_URL;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return DEFAULT_API_BASE_URL;
  }

  return trimmed.replace(/\/+$/, '');
}

/** Joins a normalised base URL with an API path using exactly one slash. */
export function apiUrl(baseUrl: string, path: string): string {
  const base = normalizeApiBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
