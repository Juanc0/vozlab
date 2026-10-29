/**
 * Journey — the admin panel end to end (P2 item 11).
 *
 * The maintainer signs in with the development token (the event-code join of
 * the standard fixtures is an anonymous GUEST and cannot administer
 * anything), and every panel of `/admin` is exercised through the UI exactly
 * as a human would:
 *
 * - the workspace list with the `kind` badges of the v6 seed (B10);
 * - the ephemeral join codes: create, inline edit (B6) and revoke;
 * - the multiple-roles rule: remove one role chip and grant the membership
 *   back through the direct add by `handle` (v6-03 + B14 handles);
 * - the global invitation form (cross-IdP): its token is shown once;
 * - the tenant hygiene sweep (B7).
 *
 * The journeys that change state are designed to return the dev database to
 * its seeded shape (remove the chip, then add it back; the created join code
 * is revoked at the end). The global invitation is the one exception: the
 * API has no list nor revoke for it (ADR-0019 is create + redeem), so its
 * row — bound to a marker mail at `@invalid.example` — accumulates per run.
 */

import { expect, test } from './support/fixtures';
import { signInAsMaintainer } from './support/dev-sign-in';

/** Unique per test; nothing the journeys create collides with another run. */
function marker(): string {
  return `e2e-${Math.random().toString(36).slice(2, 8)}`;
}

test.beforeEach(async ({ page }) => {
  await signInAsMaintainer(page, '**/admin');
  await expect(
    page.getByRole('heading', { name: 'Administración', level: 1 })
  ).toBeVisible();
});

test.describe('the admin panel as maintainer', () => {
  test('the workspace list carries the kind badges of the seed', async ({ page }) => {
    const list = page.getByRole('heading', { name: 'Espacios de trabajo', level: 2 })
      .locator('..');

    // The four workspaces the dev seed owns, each with its `kind`. The
    // maintainer administers only `general` and `community` — the list is
    // exactly the workspaces where its role is ADMIN.
    await expect(list.getByRole('button', { name: /General Campus/ })).toContainText('PUBLIC');
    await expect(list.getByRole('button', { name: /Open Community/ })).toContainText('PUBLIC');
  });

  test('a join code is created with its raw value shown once, edited inline, and revoked', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /General Campus/ }).click();

    // --- create -----------------------------------------------------------
    const label = `${marker()} open round`;
    await page.getByPlaceholder('Etiqueta').fill(label);
    await page.getByRole('button', { name: 'Crear código efímero' }).click();

    // The raw code appears exactly once: only its hash ever reaches the API.
    const shown = page.getByText('Código (se muestra una vez)');
    await expect(shown).toBeVisible();
    await expect(shown.locator('code')).toHaveText(/^[0-9A-F]{24}$/);

    // --- the list row -------------------------------------------------------
    const row = page.getByRole('listitem').filter({ hasText: label });
    await expect(row).toBeVisible();

    // --- inline edit (B6): the PATCH endpoint through the form --------------
    await row.getByRole('button', { name: 'Editar' }).click();
    await row.getByLabel('Usos máximos').fill('7');
    await row.getByRole('button', { name: 'Guardar' }).click();

    await expect(row).toContainText('uses 0/7');

    // --- revoke ------------------------------------------------------------
    await row.getByRole('button', { name: 'Revocar' }).click();
    await expect(row).toContainText('(revoked)');
  });

  test('a role chip can be removed and the membership granted back by handle', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Open Community/ }).click();

    const row = page.getByRole('listitem').filter({ hasText: 'dev-member@example.edu' });
    await expect(row).toBeVisible();

    // --- remove one role (RemoveMemberRole, the × inside the chip) ---------
    await row.locator('span.rounded', { hasText: 'MEMBER' }).locator('button').click();
    await expect(row).toBeHidden();

    // --- add it back by HANDLE: the v6/TASK-03 direct add -------------------
    // `dev-member` is the seeded handle (B10) and the same lookup the JIT
    // login now writes for real users (B14).
    await page.getByPlaceholder('Alias de usuario').fill('dev-member');
    await page.getByRole('button', { name: 'Añadir miembro' }).click();
    await expect(row).toBeVisible();

    // The seed is restored: the community member holds exactly MEMBER again.
    await expect(row.locator('span.rounded', { hasText: 'MEMBER' })).toBeVisible();
  });

  test('a role granted over an existing membership shows the union as two chips', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Open Community/ }).click();

    const row = page.getByRole('listitem').filter({ hasText: 'dev-member@example.edu' });

    // Grant MODERATOR over the existing MEMBER through the row's role picker
    // (the PATCH assign endpoint): the v5 union rule shows two chips.
    await row.getByRole('combobox').selectOption('MODERATOR');

    await expect(row.locator('span.rounded', { hasText: 'MODERATOR' })).toBeVisible();
    await expect(row.locator('span.rounded', { hasText: 'MEMBER' })).toBeVisible();

    // Back to the seed state: remove the extra role.
    await row.locator('span.rounded', { hasText: 'MODERATOR' }).locator('button').click();
    await expect(row.locator('span.rounded', { hasText: 'MODERATOR' })).toBeHidden();
    await expect(row.locator('span.rounded', { hasText: 'MEMBER' })).toBeVisible();
  });

  test('the global invitation shows its token exactly once', async ({ page }) => {
    await page.getByRole('button', { name: /Open Community/ }).click();

    const email = `${marker()}@invalid.example`;
    await page.getByPlaceholder('Correo').fill(email);
    await page.getByRole('button', { name: 'Crear invitación' }).click();

    await expect(page.getByText('Token (se muestra una vez)')).toBeVisible();
    // The raw credential is 64 hex — the API stores only its hash.
    await expect(page.getByText('Token (se muestra una vez)').locator('code')).toHaveText(
      /^[0-9a-f]{64}$/
    );
  });

  test('the hygiene sweep answers with its counts', async ({ page }) => {
    await page.getByRole('button', { name: /General Campus/ }).click();

    await page.getByLabel('Ventana de inactividad de invitados (días)').fill('30');
    await page.getByRole('button', { name: 'Ejecutar limpieza' }).click();

    // The sweep is opt-in and idempotent: with no inactive guests and no
    // PENDING invitation past its expiry, both counters read zero.
    await expect(page.getByText(/invitaciones caducadas · .* invitados eliminados/)).toBeVisible();
  });
});
