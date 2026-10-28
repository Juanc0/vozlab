import { waitForApp } from './support/app';
import { expect, test } from './support/fixtures';

test('the admin screen renders', async ({ page }) => {
  await page.goto('/admin');
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();
});

test('the request-access screen renders', async ({ page }) => {
  await page.goto('/request-access');
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Solicitar acceso', level: 1 })).toBeVisible();
});