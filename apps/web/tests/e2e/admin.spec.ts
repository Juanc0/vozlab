import { expect, test } from './support/fixtures';
import { signInAsMaintainer } from './support/dev-sign-in';

/**
 * The screens render for a signed-in user.
 *
 * They used to open without a session, but both routes live under `(app)`
 * and the guard now takes the reader to `/login` without one: the smoke
 * signs in as the maintainer first. `/request-access` is the discover screen
 * (the request-access flow) and any signed-in identity reaches it.
 */

test('the admin screen renders', async ({ page }) => {
  await signInAsMaintainer(page, '**/admin');
  await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();
});

test('the request-access screen renders', async ({ page }) => {
  await signInAsMaintainer(page, '**/request-access');
  await expect(page.getByRole('heading', { name: 'Solicitar acceso', level: 1 })).toBeVisible();
});