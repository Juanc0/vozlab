import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * `virtual:pwa-register` only exists while `vite-plugin-pwa` is active. The
 * plugin is disabled for tests, so the virtual module is aliased to a mock
 * that lets the registration flow be unit tested.
 */
const PWA_REGISTER_MOCK = fileURLToPath(new URL('./tests/mocks/pwa-register.ts', import.meta.url));

/**
 * The workspace package `@vozlab/shared-types` lives outside `apps/web`.
 *
 * SvelteKit replaces Vite's `server.fs.allow` list with its own, and that
 * list does not cover `packages/`. Without this entry the dev server answers
 * `403 Restricted` when the browser asks for the package sources.
 */
const SHARED_TYPES_DIR = fileURLToPath(new URL('../../packages/shared-types', import.meta.url));

/**
 * Resolve NodeNext `./x.js` specifiers to their `./x.ts` sources.
 *
 * `@vozlab/shared-types` is published as raw TypeScript whose internal
 * imports follow the NodeNext convention (`./schemas/auth.schema.js`). Vite
 * resolves the sources itself, so the `.js` specifiers have to be mapped back
 * to the `.ts` files. The same plugin already runs in `apps/api/vitest.config.ts`.
 *
 * The rewrite is deliberately narrow: only TypeScript sources use the
 * NodeNext convention, so a `.js` importer (a dependency, a Vite optimizer
 * chunk, a generated file) is never touched. Rewriting those would point
 * Vite at files that do not exist.
 */
const nodeNextJsToTs: Plugin = {
  name: 'nodenext-js-to-ts',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) {
      return null;
    }
    // Only a TypeScript source can carry a NodeNext `./x.js` specifier.
    if (!importer.endsWith('.ts')) {
      return null;
    }
    // Never rewrite the imports of Vite's own dependency optimizer.
    if (importer.includes('/node_modules/.vite/')) {
      return null;
    }
    return this.resolve(source.slice(0, -3) + '.ts', importer, { skipSelf: true });
  }
};

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';

  return {
    plugins: [
      nodeNextJsToTs,
      tailwindcss(),
      sveltekit(),
      ...(isTest
        ? []
        : [
            VitePWA({
              // A new service worker must wait for the user: assets are never
              // swapped silently in the middle of a session.
              registerType: 'prompt',
              // The worker is registered by hand (`$lib/pwa/register`) so the
              // "reload?" prompt is under our control.
              injectRegister: false,
              manifest: {
                name: 'VozLab',
                short_name: 'VozLab',
                start_url: '/',
                display: 'standalone',
                theme_color: '#183d6c',
                icons: [
                  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
              },
              workbox: {
                // Precache the app shell, the hashed assets, the CSS and the fonts.
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
                // SvelteKit serves the app from the server: there is no
                // `index.html` to fall back to.
                //
                // `navigateFallback` is **not** the answer either: Workbox
                // binds it to a `NavigationRoute` that answers *every*
                // navigation with the precached URL, which would replace the
                // server-rendered pages. The offline navigation is handled by
                // the runtime route below (batch 3.6).
                navigateFallback: null,
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                  {
                    // A navigation goes to the network first: the app is
                    // server-rendered. When the network fails, the
                    // precached offline page answers instead — it is a real
                    // document, not a blank screen.
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'vozlab-pages',
                      networkTimeoutSeconds: 3,
                      cacheableResponse: { statuses: [200] },
                      expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 24 * 60 * 60
                      },
                      // The fallback is the offline page of `static/`. It is
                      // in the precache manifest, so it is available even
                      // when the network is gone.
                      precacheFallback: { fallbackURL: '/offline.html' }
                    }
                  },
                  {
                    // A navigation **inside** the app does not fetch a
                    // document: the SvelteKit router reads `__data.json`.
                    // The last read is served from the cache while the
                    // network is down — the reads may come from the cache.
                    urlPattern: ({ url }) =>
                      url.origin === self.location.origin &&
                      url.pathname.endsWith('/__data.json'),
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'vozlab-data',
                      networkTimeoutSeconds: 3,
                      cacheableResponse: { statuses: [200] },
                      expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 24 * 60 * 60
                      }
                    }
                  }
                ]
              },
              // The icons are already covered by `globPatterns`; adding them
              // again would duplicate them in the precache manifest.
              includeManifestIcons: false,
              devOptions: {
                // The manifest is generated in dev too, so the `<link
                // rel="manifest">` of `app.html` resolves instead of 404ing
                // in the console on every page load. The service worker
                // itself stays off: a worker in dev caches stale modules
                // and fights with HMR.
                enabled: true,
                type: 'module',
                suppressWarnings: true,
                // The runtime routes of the build (the navigation cache and
                // the offline page) are **not** part of the dev worker: they
                // would cache the dev documents and fight with HMR. The
                // offline shell is exercised against the built app.
                disableRuntimeConfig: true
              }
            })
          ])
    ],
    resolve: isTest
      ? {
          alias: {
            'virtual:pwa-register': PWA_REGISTER_MOCK
          },
          // The tests run in a DOM: Svelte must resolve to its *client* build.
          // Without the `browser` condition `svelte` resolves to its server
          // entry and `mount()` is not available.
          conditions: ['browser']
        }
      : {},
    // `@vozlab/shared-types` ships raw TypeScript with NodeNext `./x.js`
    // specifiers. Vite already skips linked workspace packages, but the
    // exclusion makes it explicit: the package must be served as source and
    // resolved by the `nodenext-js-to-ts` plugin above, never pre-bundled.
    optimizeDeps: {
      exclude: ['@vozlab/shared-types']
    },
    // The same condition for the SSR environment of the module runner.
    ssr: isTest
      ? {
          resolve: {
            conditions: ['browser']
          }
        }
      : undefined,
    server: {
      fs: {
        // The workspace package `@vozlab/shared-types` is served to the
        // browser as source in dev mode; SvelteKit's allow list does not
        // cover `packages/`.
        allow: [SHARED_TYPES_DIR]
      }
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts']
    }
  };
});
