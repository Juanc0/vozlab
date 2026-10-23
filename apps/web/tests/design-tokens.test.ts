/**
 * The **token layer** (roadmap batch 3.15).
 *
 * The design system is a contract: the roles the sheet names must exist,
 * they must carry the values the sheet gives them, and the vocabulary of
 * the previous layer must be gone for good.
 *
 * A test that reads the stylesheet is a test of the *contract*, not of the
 * rendering: it is what stops a later batch from quietly dropping a role
 * or from bringing an old name back.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARD_COLOR,
  CARD_INK,
  CARD_META_INK,
  PRESENTED_COLOR,
  SELECTION_COLOR,
  nodeStatusBorder
} from '$lib/graph/elements';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APP_CSS = readFileSync(join(SRC, 'app.css'), 'utf8');

/** The roles of the ladder — what a colour *does*, never what it looks like. */
const ROLES = [
  'ground',
  'surface',
  'raised',
  'border',
  'rule',
  'control',
  'text',
  'muted',
  'faint',
  'accent',
  'accent-soft',
  'accent-track',
  'accent-ink',
  'secondary',
  'positive',
  'negative',
  'warning'
] as const;

/** The pill pairs: a pale tint and the dark ink of the same hue. */
const PILLS = [
  'pill-positive-bg',
  'pill-positive-ink',
  'pill-negative-bg',
  'pill-negative-ink',
  'pill-warning-bg',
  'pill-warning-ink',
  'pill-secondary-bg',
  'pill-secondary-ink',
  'pill-neutral-bg',
  'pill-neutral-ink'
] as const;

/** The geometry every screen shares. */
const GEOMETRY = [
  'radius-card',
  'radius-control',
  'row-height',
  'sidebar-width',
  'gap',
  'pad',
  'control-height'
] as const;

/** The type: the sizes and the weights. */
const SIZES = [
  'text-display',
  'text-title',
  'text-section',
  'text-brand',
  'text-kpi',
  'text-body',
  'text-small'
] as const;

/** The values the sheet prints, with the hue of the brand. */
const VALUES: Readonly<Record<string, string>> = {
  ground: '#f5f8fb',
  surface: '#ffffff',
  raised: '#eceff5',
  border: '#dce1e8',
  rule: '#e9ecf1',
  control: '#c0c6ce',
  text: '#1b2128',
  muted: '#656c76',
  accent: '#2f72c6',
  'accent-soft': '#f1f6fe',
  'accent-track': '#dfecfe',
  'accent-ink': '#1c4c8a',
  secondary: '#6d5fa3',
  positive: '#247b50',
  negative: '#c4242a',
  warning: '#92400e',
  'pill-positive-bg': '#dcfce7',
  'pill-positive-ink': '#14532d',
  'pill-negative-bg': '#ffedea',
  'pill-negative-ink': '#831c1e',
  'pill-warning-bg': '#fffbeb',
  'pill-warning-ink': '#92400e',
  'pill-secondary-bg': '#e9e6fe',
  'pill-secondary-ink': '#5c508b',
  'pill-neutral-bg': '#eceff5',
  'pill-neutral-ink': '#363e48',
  'radius-card': '8px',
  'radius-control': '6px',
  'row-height': '45px',
  'sidebar-width': '230px',
  gap: '24px',
  pad: '24px',
  'control-height': '32px',
  'text-display': '38px',
  'text-title': '32px',
  'text-section': '18px',
  'text-brand': '20px',
  'text-kpi': '24px',
  'text-body': '14px',
  'text-small': '12px'
};

/** The names of the previous layer: they must not come back. */
const FORBIDDEN = [
  '--color-ink',
  '--color-ink-muted',
  '--color-line',
  '--color-line-strong',
  '--color-surface-muted'
] as const;

/** The files of the source tree. */
function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      yield* sources(path);
      continue;
    }

    if (/\.(svelte|ts|css|html)$/.test(entry)) {
      yield path;
    }
  }
}

describe('the token layer', () => {
  it('exposes every role of the accent ladder', () => {
    for (const role of ROLES) {
      expect(APP_CSS).toContain(`--color-${role}:`);
    }
  });

  it('exposes every pill pair', () => {
    for (const pill of PILLS) {
      expect(APP_CSS).toContain(`--color-${pill}:`);
    }
  });

  it('exposes the geometry', () => {
    for (const token of GEOMETRY) {
      expect(APP_CSS).toContain(`--${token}:`);
    }
  });

  it('exposes the type scale and the weights', () => {
    for (const size of SIZES) {
      expect(APP_CSS).toContain(`--${size}:`);
    }

    expect(APP_CSS).toContain('--font-weight-medium:');
    expect(APP_CSS).toContain('--font-weight-semibold:');
    expect(APP_CSS).toContain('--font-weight-bold:');
  });

  it('carries the values of the sheet', () => {
    for (const [token, value] of Object.entries(VALUES)) {
      const declaration = new RegExp(`--color-${token}:\\s*${value};|--${token}:\\s*${value};`);

      expect(APP_CSS).toMatch(declaration);
    }
  });

  it('keeps the raw palettes as the source of the two ladders', () => {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(APP_CSS).toContain(`--color-brand-${step}:`);
      expect(APP_CSS).toContain(`--color-secondary-${step}:`);
    }
  });

  it('has no role of the previous vocabulary left', () => {
    for (const name of FORBIDDEN) {
      expect(APP_CSS).not.toContain(`${name}:`);
    }

    // And no component uses the old names either.
    for (const path of sources(SRC)) {
      if (path.endsWith('app.css')) {
        continue;
      }

      const content = readFileSync(path, 'utf8');

      for (const name of FORBIDDEN) {
        expect(content).not.toContain(name);
      }
    }
  });

  it('names the two families of the interface and loads them from the app', () => {
    expect(APP_CSS).toContain("--font-sans:");
    expect(APP_CSS).toContain("--font-serif:");
    expect(APP_CSS).toContain("'IBM Plex Sans'");
    expect(APP_CSS).toContain("'IBM Plex Serif'");

    // The faces are vendored: the shell must render with them offline.
    for (const weight of ['400', '500', '600', '700']) {
      expect(APP_CSS).toContain(`/fonts/ibm-plex-sans-latin-${weight}-normal.woff2`);
    }

    for (const weight of ['600', '700']) {
      expect(APP_CSS).toContain(`/fonts/ibm-plex-serif-latin-${weight}-normal.woff2`);
    }

    // The licence of the faces sits next to them.
    expect(() => readFileSync(join(SRC, '../static/fonts/OFL.txt'), 'utf8')).not.toThrow();
  });

  it('paints the canvas with the roles of the ladder', () => {
    // The card is a **surface** and its title is the **ink**: the canvas
    // never paints a node in a colour of its own.
    expect(CARD_COLOR).toBe(VALUES.surface);
    expect(CARD_INK).toBe(VALUES.text);
    expect(CARD_META_INK).toBe(VALUES.muted);

    // The rings are the marks of the view: the accent for the selection,
    // the ink for the node the view presents.
    expect(SELECTION_COLOR).toBe(VALUES.accent);
    expect(PRESENTED_COLOR).toBe(VALUES.text);

    // The mark of a status is the colour of the status: what waits for a
    // decision wears the secondary of the palette, never the accent.
    expect(nodeStatusBorder('PENDING').color).toBe(VALUES.secondary);
    expect(nodeStatusBorder('REJECTED').color).toBe(VALUES.negative);
    expect(nodeStatusBorder('MERGED').color).toBe(VALUES.muted);
  });
});
