/**
 * The drawer and the sheet are **modals**.
 *
 * They cover the content, so they have to behave like the modals they are:
 * the focus goes inside them, it is trapped there, <kbd>Escape</kbd> closes
 * them and the focus goes back to the control that opened them. The
 * background is inert for a screen reader while they are open.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PanelHarness from './harness/PanelHarness.svelte';
import { localeContext } from './harness/locale';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the drawer of the navigation', () => {
  it('opens, takes the focus and closes on Escape, and the focus goes back', async () => {
    render(PanelHarness, { context: localeContext(), props: { panel: 'drawer' } });

    const opener = screen.getByRole('button', { name: 'Abrir el panel' });
    const panel = screen.getByRole('dialog', { hidden: true });

    // The panel is closed: it is not in the tree of the screen reader.
    expect(panel).toHaveAttribute('aria-label', 'Menú de navegación');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect((panel as HTMLElement).inert).toBe(true);

    // The browser focuses the button that was clicked.
    opener.focus();
    await fireEvent.click(opener);

    await waitFor(() => {
      expect(panel).not.toHaveAttribute('aria-hidden');
    });

    // The focus went inside the panel.
    await waitFor(() => {
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    // The background is inert for a screen reader.
    const background = document.body.querySelector('div:not([role])');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    expect(background).toHaveAttribute('inert');

    // Escape closes the panel.
    await fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    // The focus went back to the control that opened the panel.
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it('traps the focus inside the panel', async () => {
    render(PanelHarness, { context: localeContext(), props: { panel: 'drawer' } });

    const opener = screen.getByRole('button', { name: 'Abrir el panel' });
    opener.focus();
    await fireEvent.click(opener);

    const panel = screen.getByRole('dialog', { name: 'Menú de navegación' });
    const close = screen.getByRole('button', { name: 'Cerrar el menú de navegación' });

    await waitFor(() => {
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    // The focus is on the first control of the panel.
    expect(document.activeElement).toBe(close);

    // Tab from the last control comes back to the first one: the focus
    // never leaves the panel.
    const last = screen.getByRole('link', { name: 'Debates' });
    last.focus();

    await fireEvent.keyDown(document, { key: 'Tab' });

    expect(panel.contains(document.activeElement)).toBe(true);
    expect(opener).not.toBe(document.activeElement);
  });
});

describe('the sheet of the inspector', () => {
  it('opens, takes the focus and closes on Escape, and the focus goes back', async () => {
    render(PanelHarness, { context: localeContext(), props: { panel: 'sheet' } });

    const opener = screen.getByRole('button', { name: 'Abrir el panel' });
    const panel = screen.getByRole('dialog', { hidden: true });

    expect(panel).toHaveAttribute('aria-label', 'Inspección');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    opener.focus();
    await fireEvent.click(opener);

    await waitFor(() => {
      expect(panel).not.toHaveAttribute('aria-hidden');
    });

    await waitFor(() => {
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    await fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it('traps the focus inside the panel', async () => {
    render(PanelHarness, { context: localeContext(), props: { panel: 'sheet' } });

    const opener = screen.getByRole('button', { name: 'Abrir el panel' });
    opener.focus();
    await fireEvent.click(opener);

    const panel = screen.getByRole('dialog', { name: 'Inspección' });
    const close = screen.getByRole('button', { name: 'Cerrar el inspector' });

    await waitFor(() => {
      expect(document.activeElement).toBe(close);
    });

    const last = screen.getByRole('link', { name: 'Debates' });
    last.focus();

    await fireEvent.keyDown(document, { key: 'Tab' });

    expect(panel.contains(document.activeElement)).toBe(true);
  });
});
