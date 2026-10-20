/**
 * Test double for the `virtual:pwa-register` module.
 *
 * `vite-plugin-pwa` is disabled during tests, so the virtual module is
 * aliased to this file (see `vite.config.ts`). The spies let the registration
 * flow be asserted without a real service worker.
 */

import { vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

/** Options passed to the last `registerSW` call. */
export const registerSWOptions: RegisterSWOptions[] = [];

/** Resolves once the "waiting" worker has been told to take over. */
export const updateServiceWorker = vi.fn(async () => {});

export const registerSW = vi.fn((options: RegisterSWOptions = {}) => {
  registerSWOptions.push(options);
  return updateServiceWorker;
});

/** Clears the recorded calls between tests. */
export function resetPwaRegisterMock(): void {
  registerSWOptions.length = 0;
  registerSW.mockClear();
  updateServiceWorker.mockClear();
}
