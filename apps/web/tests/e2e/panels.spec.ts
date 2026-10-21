/**
 * Journey — the panels of the workspace.
 *
 * Three panels fold: the navigation of the app, the inspector of the
 * workspace and the panel of the root picker. The reader decides, and the
 * decision is remembered in a **cookie** — never in the storage of the
 * browser — so the next visit finds the screen as it was left.
 *
 * The journey checks the three things a reader can see: the rail keeps the
 * names of the sections, the root picker opens with a search that filters,
 * and a reload finds the same screen.
 */

import { openRootPicker, waitForApp } from './support/app';
import { WEB_ORIGIN } from './support/config';
import { expect, test } from './support/fixtures';

/** The cookie that carries the state of the panels. */
const PANELS_COOKIE = 'vozlab_panels';

test('the navigation folds into a rail and the panels are remembered', async ({
  page,
  context,
  api
}) => {
  // The journey writes nothing: the seeded graph is enough, and the write
  // budget of the API is shared by the whole suite.
  const [node] = await api.listNodes();

  if (node === undefined) {
    throw new Error('the workspace of the seed holds no node');
  }

  // The reader folded the navigation and left the inspector alone: the
  // cookie says so, and the server renders the screen already folded.
  await context.addCookies([
    {
      name: PANELS_COOKIE,
      value: encodeURIComponent(
        JSON.stringify({
          navCollapsed: true,
          inspectorCollapsed: true,
          rootCollapsed: true
        })
      ),
      url: WEB_ORIGIN
    }
  ]);

  await page.goto('/');
  await waitForApp(page);

  // The rail is 56 pixels wide — the sections are still there, with their
  // names.
  const navigation = page.getByRole('complementary', { name: 'Espacio de trabajo y secciones' });
  await expect(navigation).toBeVisible();
  await expect(navigation).toHaveCSS('width', /^5[0-9]px$/);

  await expect(page.getByRole('link', { name: 'Grafo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Propuestas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Debates' })).toBeVisible();

  // The inspector is folded: the walk through the graph happens without it.
  await expect(page.getByRole('button', { name: 'Mostrar el inspector' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Contenido' })).toHaveCount(0);

  // The panel of the root picker is folded too — and the toolbar opens it.
  await expect(page.getByRole('button', { name: 'Raíz', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false'
  );

  await openRootPicker(page);
  await expect(page.getByRole('button', { name: node.title })).toBeVisible();

  // A reload finds the same screen: the state is in the cookie. The root
  // picker was opened a moment ago, so it is open again; the navigation is
  // still a rail and the inspector is still folded.
  await page.reload();
  await waitForApp(page);

  await expect(
    page.getByRole('complementary', { name: 'Espacio de trabajo y secciones' })
  ).toHaveCSS('width', /^5[0-9]px$/);
  await expect(page.getByRole('button', { name: 'Mostrar el inspector' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Raíz', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.getByRole('button', { name: node.title })).toBeVisible();
});

test('the root picker opens with a search that filters the nodes', async ({ page, api }) => {
  const [node] = await api.listNodes();

  if (node === undefined) {
    throw new Error('the workspace of the seed holds no node');
  }

  await page.goto('/');
  await waitForApp(page);

  // The panel is folded: the control of the toolbar opens it.
  await expect(page.getByRole('button', { name: 'Raíz', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false'
  );

  await openRootPicker(page);

  const search = page.getByLabel('Buscar un nodo');

  // The search is a text field, and it is operated with the keyboard.
  await search.fill(node.title);

  await expect(page.getByRole('button', { name: node.title })).toBeVisible();

  // The count of what is left is said out loud.
  await expect(page.locator('#vozlab-root-search-status')).toContainText(
    'Nodos que coinciden:'
  );

  // An empty result is a sentence, and not an error.
  await search.fill('telepatía');

  await expect(page.getByText(/Ningún nodo coincide/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // And the node is still there when the search is cleared.
  await search.fill('');

  await expect(page.getByRole('button', { name: node.title })).toBeVisible();
});
