import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * `virtual:pwa-register` only exists while `vite-plugin-pwa` is active. The
 * plugin is disabled for tests, so the virtual module is aliased to a mock
 * that lets the registration flow be unit tested.
 */
const PWA_REGISTER_MOCK = fileURLToPath(new URL('./tests/mocks/pwa-register.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';

  return {
    plugins: [
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
                theme_color: '#1e3a8a',
                icons: [
                  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
              },
              workbox: {
                // Precache the app shell, the hashed assets, the CSS and the fonts.
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
                // SvelteKit serves the app from the server: there is no
                // `index.html` to fall back to. Offline navigation is handled
                // by the offline shell (batch 3.6).
                navigateFallback: null,
                cleanupOutdatedCaches: true
              },
              // The icons are already covered by `globPatterns`; adding them
              // again would duplicate them in the precache manifest.
              includeManifestIcons: false,
              devOptions: {
                enabled: false
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
    // The same condition for the SSR environment of the module runner.
    ssr: isTest
      ? {
          resolve: {
            conditions: ['browser']
          }
        }
      : undefined,
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/setup.ts']
    }
  };
});
