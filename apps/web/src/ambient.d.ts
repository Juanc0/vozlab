/**
 * Ambient declaration for the `virtual:pwa-register` module provided by
 * `vite-plugin-pwa` at build time.
 *
 * This file must stay a *global script* (no top-level `import`/`export`),
 * otherwise TypeScript treats `declare module` as an augmentation of an
 * existing module and fails with "Cannot find module 'virtual:pwa-register'".
 */
declare module 'virtual:pwa-register' {
  import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

  export type { RegisterSWOptions };

  /**
   * Registers the service worker and returns the callback that activates the
   * waiting worker (used by the `prompt` registration mode).
   */
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
