#!/usr/bin/env node
/**
 * Captures screenshots + full HTML of the shipped routes at desktop and mobile
 * viewports, against a *running* dev server.
 *
 *   pnpm --filter @vozlab/web capture:screenshots
 *   CAPTURE_BASE_URL=http://localhost:4173 pnpm --filter @vozlab/web capture:screenshots
 *
 * Output: docs/analysis/screenshots/<YYYY-MM-DD>/<slug>-<W>x<H>.{png,html}
 *
 * Robust: a failed navigation is logged and skipped (never aborts the run);
 * `networkidle` is awaited with a timeout.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const BASE_URL = (process.env.CAPTURE_BASE_URL || 'http://localhost:5173').replace(
  /\/$/,
  ''
);
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(ROOT, 'docs', 'analysis', 'screenshots', DATE);

const ROUTES = ['/', '/login', '/proposals', '/discussions', '/admin'];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
];

function slugFor(route) {
  if (route === '/') return 'root';
  const slug = route.replace(/^\/+/, '').replace(/\//g, '-');
  return slug || 'root';
}

mkdirSync(OUT_DIR, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (err) {
  console.error(`could not launch chromium: ${err.message}`);
  process.exit(1);
}

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of ROUTES) {
      const url = BASE_URL + route;
      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
          console.warn(`networkidle timeout for ${url}: ${e.message}`);
        }

        if (response && response.status() >= 400) {
          console.warn(`skip ${url}: HTTP ${response.status()}`);
          continue;
        }
        if (route === '/admin' && !page.url().includes('/admin')) {
          console.warn(`skip ${url}: admin not reachable (redirected)`);
          continue;
        }

        const slug = slugFor(route);
        const base = `${slug}-${viewport.width}x${viewport.height}`;
        const pngPath = join(OUT_DIR, `${base}.png`);
        const htmlPath = join(OUT_DIR, `${base}.html`);
        await page.screenshot({ path: pngPath, fullPage: true });
        writeFileSync(htmlPath, await page.content(), 'utf8');
        console.log(`captured ${route} @ ${viewport.width}x${viewport.height}`);
      } catch (err) {
        console.warn(`failed ${url}: ${err.message}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`done: ${OUT_DIR}`);
