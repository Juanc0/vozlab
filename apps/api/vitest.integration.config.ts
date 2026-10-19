import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/** Resolve NodeNext `./x.js` specifiers to their `./x.ts` sources. */
const nodeNextJsToTs: Plugin = {
  name: 'nodenext-js-to-ts',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.startsWith('.') && source.endsWith('.js')) {
      return this.resolve(source.slice(0, -3) + '.ts', importer, { skipSelf: true });
    }
    return null;
  },
};

export default defineConfig({
  plugins: [nodeNextJsToTs],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup/env.ts'],
    // One file today; keep it serial so future suites do not race on the
    // shared dev tenant, router event codes or Redis rate-limit buckets.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
