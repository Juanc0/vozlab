/**
 * The **clone of `dagre`** and the **production bundle**.
 *
 * The clone arranges the picture with `d3-dag`, and the library is a
 * dependency of the **development surface** only: the comparison of the
 * engines is the only thing that ever asks for the `dag` layout. The
 * production bundle must not carry the Sugiyama of `d3-dag` — forty
 * kilobytes gzipped for a layout nobody in the app chooses.
 *
 * The test walks the **static** imports of the sources of the app — the
 * imports the bundler follows — and says three things:
 *
 * - no module of the production reaches `d3-dag`;
 * - the instance of the exploration view does not import the clone, not
 *   even the module that holds it;
 * - the development surface **does** import it: the comparison still has
 *   the clone, and it is the comparison that brings it.
 *
 * The walk is on the **sources** and not on the built bundle: the bundle is
 * the proof, and the sources are the rule. A static import that came back
 * would break the rule, and the test would fail.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The root of the sources of the app.
 *
 * It is the directory the tests run in — the package of the app — and not
 * the URL of this file: the environment of the tests is a DOM, and its
 * `import.meta.url` is not a URL of a file.
 */
const SOURCE_ROOT = resolve(process.cwd(), 'src');

/** The development surface — the only place the clone may live. */
const DEV_ROOT = resolve(SOURCE_ROOT, 'lib/dev');

/** The library that must not travel. */
const LIBRARY = 'd3-dag';

/** The module that holds the clone. */
const CLONE_MODULE = resolve(SOURCE_ROOT, 'lib/dev/engines/dag.ts');

/** The instance of the exploration view — the module of the production. */
const INSTANCE_MODULE = resolve(SOURCE_ROOT, 'lib/graph/explore/instance.ts');

/** The extensions of the modules of the app. */
const EXTENSIONS = ['.ts', '.svelte'];

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

/** The imports of a module, with the ones of the types apart. */
interface Imports {
  /** The modules the code runs. */
  readonly runtime: readonly string[];
  /** The modules of the **types** — erased when the code is compiled. */
  readonly types: readonly string[];
}

/**
 * Removes the **comments** of a source.
 *
 * The prose of the sources talks about imports — and a walk that reads the
 * prose would take a sentence for an import statement.
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
      // A string: it is copied as it is, and its quotes are found.
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
 * Reads the imports of a module.
 *
 * The **dynamic** imports are left out on purpose: the comparison of the
 * engines is imported dynamically, behind `import.meta.env.DEV`, and a
 * production build removes the branch before it resolves anything.
 *
 * @param path - The path of the module.
 * @returns The imports of the module.
 */
function importsOf(path: string): Imports {
  const source = stripComments(readFileSync(path, 'utf8'));
  const runtime: string[] = [];
  const types: string[] = [];

  const pattern = /\bimport\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;

  let match = pattern.exec(source);

  while (match !== null) {
    const clause = match[2] ?? '';
    const specifier = match[3] ?? '';

    // A dynamic import has no `from`: the clause of a match that reaches
    // one is not an import statement at all.
    const dynamic = clause.includes('(') || clause.includes(')');

    if (!dynamic) {
      const braces = /\{([\s\S]*)\}/.exec(clause);
      const onlyTypes =
        (match[1] !== undefined) ||
        (braces !== null &&
          braces[1]
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .every((entry) => entry.startsWith('type ')));

      if (onlyTypes) {
        types.push(specifier);
      } else {
        runtime.push(specifier);
      }
    }

    match = pattern.exec(source);
  }

  return { runtime, types };
}

/**
 * Resolves a specifier into the module it points at.
 *
 * @param specifier - The specifier of the import.
 * @param from - The module that imports it.
 * @returns The path of the module, or `null` when it is a package.
 */
function resolveSpecifier(specifier: string, from: string): string | null {
  let base: string;

  if (specifier.startsWith('.')) {
    base = resolve(dirname(from), specifier);
  } else if (specifier.startsWith('$lib/')) {
    base = resolve(SOURCE_ROOT, 'lib', specifier.slice('$lib/'.length));
  } else {
    return null;
  }

  const candidates = [
    base,
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...EXTENSIONS.map((extension) => join(base, `index${extension}`))
  ];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Not a file: the next candidate is tried.
    }
  }

  return null;
}

/**
 * The packages a module reaches through its **static** imports.
 *
 * @param path - The module to walk from.
 * @returns The names of the packages it reaches.
 */
function packagesOf(path: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue: string[] = [path];

  while (queue.length > 0) {
    const current = queue.pop() as string;

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);

    for (const specifier of importsOf(current).runtime) {
      const target = resolveSpecifier(specifier, current);

      if (target === null) {
        packages.add(specifier);
        continue;
      }

      queue.push(target);
    }
  }

  return packages;
}

/** Every module of the sources of the app. */
const MODULES = modulesOf(SOURCE_ROOT);

describe('the clone of dagre', () => {
  it('does not reach the library of d3-dag from the production', () => {
    const offenders = MODULES.filter(
      (path) => !path.startsWith(DEV_ROOT) && packagesOf(path).has(LIBRARY)
    );

    expect(offenders).toEqual([]);
  });

  it('is not imported by the instance of the exploration view', () => {
    const runtime = importsOf(INSTANCE_MODULE).runtime;

    // The clone is **handed over** by the comparison of the engines: the
    // instance knows its shape and nothing else.
    expect(runtime).not.toContain('$lib/dev/engines/dag');
    expect(runtime).not.toContain('./dag-clone');
    expect(packagesOf(INSTANCE_MODULE).has(LIBRARY)).toBe(false);
  });

  it('is in the development surface, and it is there that the library is', () => {
    // The comparison of the engines brings the clone, and the library is
    // its dependency: the comparison is imported dynamically, behind
    // `import.meta.env.DEV`, and a production build has none of it.
    expect(importsOf(CLONE_MODULE).runtime).toContain(LIBRARY);
  });
});
