import { defineConfig, devices } from '@playwright/test';
import {
  API_BASE_URL,
  API_ORIGIN,
  API_PORT_NUMBER,
  WEB_ORIGIN,
  WEB_PORT_NUMBER
} from './tests/e2e/support/config';

/**
 * The Playwright configuration of the PWA (roadmap 3.7).
 *
 * The suite is **opt-in**: it drives a real browser against a real stack
 * (PostgreSQL, Redis, the API and the dev server of the PWA). It is not part
 * of `pnpm test` and it is not wired into the Turbo gate — the CI job that
 * runs it is roadmap 4.3. It is wired like the integration suite of the API
 * (`test:integration`): a package script, no task in `turbo.json`.
 *
 * Two servers are started here — the API on `:3000` and the PWA on `:5173`,
 * the ports of the local stack of `docs/runbook-dev.md`:
 *
 * - `reuseExistingServer` is on: a developer who already runs the stack keeps
 *   it and the suite uses it as it is;
 * - when they are not running, Playwright starts them — the API with the
 *   origin of the PWA (CORS) and the PWA pointed at the API of the run.
 *
 * `E2E_WEB_PORT` and `E2E_API_PORT` move the pair, for the case where the
 * ports of the local stack are taken.
 *
 * The API needs the migrated and the seeded databases (`db:migrate` and
 * `db:seed:dev`); the global setup fails with an explicit message when they
 * are missing.
 *
 * Chromium only: the multi-browser matrix belongs to the CI job (roadmap
 * 4.3).
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',

  // One tenant, one workspace, one event-code registry: the journeys share
  // the dev database, so they run one after the other.
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_ORIGIN,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  webServer: [
    {
      command: 'pnpm --filter @vozlab/api start',
      url: `${API_ORIGIN}/health/ready`,
      reuseExistingServer: true,
      timeout: 60_000,
      // The CORS origin of the API must be the origin of the PWA, and the
      // API must listen on the port of this run.
      env: { WEB_ORIGIN, PORT: String(API_PORT_NUMBER) }
    },
    {
      // `--strictPort`: the dev server must fail instead of taking the next
      // free port — the suite has to know where the app is.
      command: `pnpm --filter @vozlab/web dev --port ${WEB_PORT_NUMBER} --strictPort`,
      url: WEB_ORIGIN,
      reuseExistingServer: true,
      timeout: 120_000,
      // The PWA calls the API from the browser: it must be pointed at the
      // API of this run.
      env: { PUBLIC_API_BASE_URL: API_BASE_URL }
    }
  ]
});
