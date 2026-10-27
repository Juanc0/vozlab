/**
 * Journey — institutional login via the OIDC broker (Zitadel).
 *
 * Requires the full stack: Zitadel on :8081, API on :3000, Web on :5173.
 * Run manually: `pnpm --filter @vozlab/web test:e2e --grep oidc`
 *
 * The broker must have a project 'vozlab', an app 'vozlab-api' and a user
 * 'testuser3' / 'Testpass1!' (email verified). Run scripts/setup-zitadel.sh
 * to configure Zitadel automatically.
 */
import { expect, test } from './support/fixtures';

test.describe('institutional login via OIDC', () => {
  test('logs in through Zitadel with local provider and restores the session', async ({ page }) => {
    // Start at the login page.
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Click the local provider button (redirects to Zitadel).
    await page.getByRole('button', { name: /cuenta local|local account/i }).click();

    // Should land on Zitadel's login page.
    await page.waitForURL(/localhost:8081/, { timeout: 10_000 });

    // Enter credentials.
    await page.getByLabel(/login name|nombre de usuario/i).fill('testuser3');
    await page.getByRole('button', { name: /next|siguiente/i }).click();
    await page.getByLabel(/password|contraseña/i).fill('Testpass1!');
    await page.getByRole('button', { name: /next|siguiente/i }).click();

    // Handle 2FA setup screen if it appears.
    const skipButton = page.getByRole('button', { name: /skip/i });
    if (await skipButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipButton.click();
    }

    // Should redirect back to the PWA.
    await page.waitForURL(/localhost:5173/, { timeout: 15_000 });

    // Session should be restored.
    await expect(page.getByText('Test User')).toBeVisible({ timeout: 10_000 });
  });
});
