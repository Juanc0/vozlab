import { env } from '$env/dynamic/public';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from '$lib/config/api-base-url';
import type { LayoutServerLoad } from './$types';

/**
 * Runtime configuration is read from the environment **on the server** so the
 * container image can be re-pointed at another API without a rebuild. The
 * value is handed to the browser through the layout data.
 */
export const load: LayoutServerLoad = () => {
  const configured = env.PUBLIC_API_BASE_URL;
  const apiBaseUrl = normalizeApiBaseUrl(configured);

  if (
    configured &&
    configured.trim() !== '' &&
    apiBaseUrl === DEFAULT_API_BASE_URL &&
    configured.trim() !== DEFAULT_API_BASE_URL
  ) {
    console.warn(
      `[vozlab/web] Ignoring invalid PUBLIC_API_BASE_URL "${configured}"; falling back to ${DEFAULT_API_BASE_URL}.`
    );
  }

  return { apiBaseUrl };
};
