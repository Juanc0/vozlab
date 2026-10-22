/**
 * The engines that are **gone**.
 *
 * The comparison carries three engines: the deterministic `dagre`, the
 * living spring and the clone of `dagre` with `d3-dag`. Sigma.js and
 * `cytoscape-fcose` were removed — their tabs, their copy, their files and
 * their dependencies — because they did not earn their place in the
 * comparison.
 *
 * Copy that talks about something that no longer exists is a hole in the
 * interface, and a dependency that is not imported is weight in the
 * install: the test says both are gone.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINES } from '$lib/dev/engines/engines';
import { en, es } from '$lib/i18n';

/** The copy of a dictionary, flattened to its dotted paths. */
function flat(
  node: unknown,
  prefix = '',
  into: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (typeof value === 'string') {
      into[path] = value;
    } else {
      flat(value, path, into);
    }
  }

  return into;
}

const GONE_IDS = ['sigma', 'fcose'];

const GONE_FILES = [
  'SigmaPanel.svelte',
  'sigma-graph.ts',
  'fcose.ts',
  'cytoscape-fcose.d.ts',
  'card-texture.ts',
  'spring.ts',
  'settle.ts'
];

describe('the engines that were removed from the comparison', () => {
  it('leaves the four engines: dagre, the living spring with its two painters and d3-dag', () => {
    expect(ENGINES.map((engine) => engine.id)).toEqual(['dagre', 'd3', 'svg', 'dag']);
    expect(ENGINES.every((engine) => !GONE_IDS.includes(engine.id))).toBe(true);
  });

  it('leaves no copy of Sigma or fcose in either language', () => {
    for (const dictionary of [flat(es), flat(en)]) {
      for (const key of Object.keys(dictionary)) {
        expect(
          GONE_IDS.some((name) => key.toLowerCase().includes(name)),
          `${key} is a leftover`
        ).toBe(false);
      }
    }

    // The note of the hierarchy is the copy of the two layered engines,
    // and it is in both languages.
    expect(es.engines.hierarchyStatic).toBe(
      'Una jerarquía no respira: sus rangos son el dibujo.'
    );
    expect(en.engines.hierarchyStatic).toBe(
      'A hierarchy does not breathe: its ranks are the drawing.'
    );
  });

  it('does not depend on Sigma, Graphology or cytoscape-fcose', () => {
    const packageJson = JSON.parse(
      readFileSync(`${process.cwd()}/package.json`, 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    for (const name of [
      'sigma',
      'graphology',
      'graphology-layout-forceatlas2',
      'cytoscape-fcose'
    ]) {
      expect(dependencies[name], `${name} is still a dependency`).toBeUndefined();
    }
  });

  it('has deleted the files of the removed engines', () => {
    for (const file of GONE_FILES) {
      expect(
        existsSync(`${process.cwd()}/src/lib/dev/engines/${file}`),
        `${file} is still on disk`
      ).toBe(false);
    }
  });
});
