/**
 * The global setup of the E2E suite.
 *
 * The suite needs **two real sessions**, and both start with a credential a
 * test cannot mint from the browser:
 *
 * 1. **The participant** — the PWA keeps the access token in memory and the
 *    refresh token in an `HttpOnly` cookie, so a test cannot open a session
 *    with a minted JWT. The local path is the event-code join, and the event
 *    code is issued by the **operator CLI** (`db:event-code`) — the same
 *    script the runbook documents. The API has no route to create one: an
 *    event code is issued by an operator, not by a client. `JoinEvent` only
 *    accepts a workspace of kind `EVENT` (v6/TASK-02), so the code targets
 *    the seeded `evento-demo`, whose base ontology the seed mirrors.
 *
 * 2. **The administrator** — the admin journeys (join codes, invitations,
 *    direct add, roles) need a workspace ADMIN. `db:mint-token` mints the
 *    maintainer's JWT against the tenant's LIVE `oidc_tenant_id` (the value
 *    the reconcile script moved), and the browser adopts it through the
 *    development sign-in of the login screen — the same panel the demo
 *    presenter uses. The token travels to the tests through the environment;
 *    nothing writes it to disk.
 *
 * Both CLIs print their secrets exactly once; the setup reads them out of
 * the output and hands them to the tests. The event code lives in the
 * **router** database (the global registry, ADR-0019) and is valid for the
 * day; the maintainer token lives 12 hours.
 */

import { execFileSync } from 'node:child_process';
import { EVENT_WORKSPACE_ID } from './support/config';

/** The raw code the CLI prints: `vle_` + base64url. */
const RAW_CODE = /vle_[A-Za-z0-9_-]+/;

/** The minted JWT the CLI prints between the banners. */
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/** The tenant of the dev seed. */
const TENANT = 'sabana';

/** Runs a `pnpm --filter @vozlab/database` script and returns its output. */
function runDatabaseScript(script: string, args: string[]): string {
  try {
    return execFileSync('pnpm', ['--filter', '@vozlab/database', script, '--', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(
      `\`db:${script}\` failed: ${stderr.trim() || String(error)}\n` +
        'The suite needs the local stack: `pnpm --filter @vozlab/database db:migrate` and ' +
        '`pnpm --filter @vozlab/database db:seed:dev`.'
    );
  }
}

export default function globalSetup(): void {
  const codeOutput = runDatabaseScript('db:event-code', [
    '--tenant',
    TENANT,
    '--workspace',
    EVENT_WORKSPACE_ID,
    '--label',
    'Playwright E2E',
    '--days',
    '1',
  ]);

  const code = RAW_CODE.exec(codeOutput);
  if (code === null) {
    throw new Error(`The event code could not be read out of the CLI output:\n${codeOutput}`);
  }
  process.env['E2E_EVENT_CODE'] = code[0];

  // The admin journeys need the maintainer's token. The mint script reads
  // the tenant's live `oidc_tenant_id` from the router DB, so the JWT passes
  // TenantGuard even after the reconcile script moved the seeded placeholder.
  const tokenOutput = runDatabaseScript('db:mint-token', ['--as', 'maintainer']);
  const token = JWT.exec(tokenOutput);
  if (token === null) {
    throw new Error(
      `The maintainer token could not be read out of the CLI output:\n${tokenOutput}`
    );
  }
  process.env['E2E_MAINTAINER_TOKEN'] = token[0];
}
