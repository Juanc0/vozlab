/**
 * The **SVG painter** and the **production bundle**.
 *
 * The painter is a candidate of the **development surface**: the
 * comparison of the engines is imported behind `import.meta.env.DEV`, and a
 * production build has no comparison and no painter. The dependencies of
 * the painter (`d3-selection`, `d3-zoom`, `d3-drag`) are devDependencies:
 * they are weight of the install and of the comparison, never of the app.
 *
 * The test walks the modules of the sources and says three things:
 *
 * - no module outside `$lib/dev` names the painter or its three packages;
 * - the three packages are devDependencies and not dependencies;
 * - a `build/client` that is already built carries no marker of the
 *   painter. The sources are the rule; the bundle is the proof.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The root of the sources of the app. */
const SOURCE_ROOT = resolve(process.cwd(), 'src');

/** The development surface — the only place the painter may live. */
const DEV_ROOT = resolve(SOURCE_ROOT, 'lib/dev');

/** The directory of the painter. */
const PAINTER_ROOT = resolve(DEV_ROOT, 'engines/svg');

/** The packages the painter brings. */
const PACKAGES = ['d3-selection', 'd3-zoom', 'd3-drag'];

/** The markers of the painter in a built asset. */
const MARKERS = [
  'vozlab-svg-card',
  'vozlab-svg-painter',
  'createSvgPainter',
  'SvgEnginePanel',
  ...PACKAGES
];

/** The extensions of the modules of the app. */
const EXTENSIONS = ['.ts', '.svelte'];

/**
 * Removes the comments of a source.
 *
 * The prose of the sources talks about imports and packages, and a walk that
 * reads the prose would take a sentence for an import statement.
 *
 * @param source - The source of the module.
 * @returns The source without its comments.
 */
function stripComments(source: string): string {
  let result = '';
  let index = 0;

  while (index < source.length) {
    const pair = source.slice(index, index + 2);

    if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);

      index = end === -1 ? source.length : end + 2;
      result += ' ';
      continue;
    }

    if (pair === '//') {
      const end = source.indexOf('\n', index);

      index = end === -1 ? source.length : end;
      result += ' ';
      continue;
    }

    const character = source[index] as string;

    if (character === "'" || character === '"' || character === '`') {
      result += character;
      index += 1;

      while (index < source.length) {
        const inner = source[index] as string;

        result += inner;
        index += 1;

        if (inner === '\\') {
          result += source[index] ?? '';
          index += 1;
          continue;
        }

        if (inner === character) {
          break;
        }
      }

      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

/**
 * Every module of the sources of the app.
 *
 * @param directory - The directory to walk.
 * @returns The paths of the modules, absolute.
 */
function modulesOf(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...modulesOf(path));
      continue;
    }

    if (EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }

  return found;
}

/**
 * The specifiers a module imports, statically or dynamically.
 *
 * @param path - The path of the module.
 * @returns The specifiers, as they are written.
 */
function specifiersOf(path: string): string[] {
  const source = stripComments(readFileSync(path, 'utf8'));
  const specifiers: string[] = [];

  const staticImport = /\b(?:import|export)\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g;
  const sideEffect = /\bimport\s*['"]([^'"]+)['"]/g;
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

  for (const pattern of [staticImport, sideEffect, dynamic]) {
    let match = pattern.exec(source);

    while (match !== null) {
      specifiers.push(match[1] ?? '');
      match = pattern.exec(source);
    }
  }

  return specifiers;
}

/**
 * Whether a specifier points at the painter.
 *
 * @param specifier - The specifier of the import.
 * @param path - The module that imports it.
 * @returns Whether the specifier names the painter.
 */
function namesPainter(specifier: string, path: string): boolean {
  if (PACKAGES.includes(specifier)) {
    return true;
  }

  if (specifier.startsWith('$lib/dev/engines/svg')) {
    return true;
  }

  if (!specifier.startsWith('.')) {
    return false;
  }

  return resolve(dirname(path), specifier).startsWith(PAINTER_ROOT);
}

/** Every module of the sources of the app. */
const MODULES = modulesOf(SOURCE_ROOT);

/**
 * Every file of a built client, when the client was built.
 *
 * @param directory - The directory to walk.
 * @returns The paths of the files, absolute.
 */
function filesOf(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...filesOf(path));
    } else {
      found.push(path);
    }
  }

  return found;
}

describe('the SVG painter and the production bundle', () => {
  it('is not named by any module outside the development surface', () => {
    const offenders = MODULES.filter((path) => !path.startsWith(DEV_ROOT)).filter((path) =>
      specifiersOf(path).some((specifier) => namesPainter(specifier, path))
    );

    expect(offenders.map((path) => relative(SOURCE_ROOT, path))).toEqual([]);
  });

  it('brings its three packages as devDependencies, never as dependencies', () => {
    const packageJson = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const name of PACKAGES) {
      expect(packageJson.dependencies?.[name], `${name} is a dependency`).toBeUndefined();
      expect(packageJson.devDependencies?.[name], `${name} is not a devDependency`).toBeDefined();
    }

    // The living spring is production: the incumbent still arranges with it.
    expect(packageJson.dependencies?.['d3-force']).toBeDefined();
    expect(packageJson.devDependencies?.['d3-force']).toBeUndefined();
  });

  it('leaves no marker of the painter in a client that was built', () => {
    const client = resolve(process.cwd(), 'build/client');

    if (!existsSync(client)) {
      // The test does not build: a repository that has not built the client
      // still gets the rule from the sources above.
      return;
    }

    const assets = filesOf(client).filter(
      (path) => !/\.(map|png|ico|woff2?)$/.test(path)
    );

    const found = assets.filter((path) => {
      const content = readFileSync(path, 'utf8');

      return MARKERS.some((marker) => content.includes(marker));
    });

    expect(found.map((path) => relative(client, path))).toEqual([]);
  });
});
