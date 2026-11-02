/**
 * The global setup of the E2E suite.
 *
 * The suite needs a **real session**: the PWA keeps the access token in
 * memory and the refresh token in an `HttpOnly` cookie, so a test cannot
 * open a session with a minted JWT. The local path is the event-code join,
 * and the event code is issued by the **operator CLI** (`db:event-code`) —
 * the same script the runbook documents. The API has no route to create one:
 * an event code is issued by an operator, not by a client.
 *
 * The CLI prints the raw code exactly once; the setup reads it out of the
 * output and hands it to the tests through the environment. The code lives in
 * the **router** database (the global registry, ADR-0019) and is valid for
 * the day.
 */

import { execFileSync } from 'node:child_process';
import { WORKSPACE_ID } from './support/config';

/** The raw code the CLI prints: `vle_` + base64url. */
const RAW_CODE = /vle_[A-Za-z0-9_-]+/;

/** The tenant of the dev seed. */
const TENANT = 'sabana';

export default function globalSetup(): void {
  let output: string;

  try {
    output = execFileSync(
      'pnpm',
      [
        '--filter',
        '@vozlab/database',
        'db:event-code',
        '--',
        '--tenant',
        TENANT,
        '--workspace',
        WORKSPACE_ID,
        '--label',
        'Playwright E2E',
        '--days',
        '1'
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(
      `The event code could not be created: ${stderr.trim() || String(error)}\n` +
        'The suite needs the local stack: `pnpm --filter @vozlab/database db:migrate` and ' +
        '`pnpm --filter @vozlab/database db:seed:dev`.'
    );
  }

  const code = RAW_CODE.exec(output);

  if (code === null) {
    throw new Error(`The event code could not be read out of the CLI output:\n${output}`);
  }

  process.env['E2E_EVENT_CODE'] = code[0];
}
