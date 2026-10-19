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
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts'],
  },
});
