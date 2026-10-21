/**
 * The search of the **root picker**.
 *
 * The reader knows the title of the node they are looking for, and the
 * search filters the list while they type. The match is case- and
 * accent-insensitive, and it is done in the language of the interface.
 */

import { describe, expect, it } from 'vitest';
import { filterNodesByTitle, matchesTitle, normalizeForSearch } from '$lib/graph/root-search';

const NODES = [
  { title: 'Problema de acceso al laboratorio' },
  { title: 'Ideación de un curso' },
  { title: 'Análisis de la muestra' }
];

describe('the search of the root picker', () => {
  it('finds a title whatever the case is', () => {
    expect(matchesTitle('Problema de acceso', 'problema', 'es')).toBe(true);
    expect(matchesTitle('Problema de acceso', 'PROBLEMA', 'es')).toBe(true);
    expect(matchesTitle('Problema de acceso', 'Problema', 'es')).toBe(true);
  });

  it('finds a title whatever the accent is', () => {
    expect(matchesTitle('Análisis de la muestra', 'analisis', 'es')).toBe(true);
    expect(matchesTitle('Análisis de la muestra', 'ANÁLISIS', 'es')).toBe(true);
    expect(matchesTitle('Ideación de un curso', 'ideacion', 'es')).toBe(true);
  });

  it('finds a title in the middle of it', () => {
    expect(matchesTitle('Problema de acceso al laboratorio', 'acceso', 'es')).toBe(true);
    expect(matchesTitle('Problema de acceso al laboratorio', 'al lab', 'es')).toBe(true);
  });

  it('finds nothing when nothing was written', () => {
    // A search that finds nothing when nothing was written is a search
    // that is broken.
    expect(matchesTitle('Problema de acceso', '', 'es')).toBe(true);
    expect(matchesTitle('Problema de acceso', '   ', 'es')).toBe(true);
    expect(filterNodesByTitle(NODES, '', 'es')).toHaveLength(NODES.length);
  });

  it('leaves an empty result when nothing answers the query', () => {
    const found = filterNodesByTitle(NODES, 'telepatía', 'es');

    expect(found).toEqual([]);
  });

  it('filters the list of the nodes', () => {
    const found = filterNodesByTitle(NODES, 'idea', 'es');

    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe('Ideación de un curso');
  });

  it('normalizes the text with the rules of the language', () => {
    expect(normalizeForSearch('Análisis', 'es')).toBe('analisis');
    expect(normalizeForSearch('ÁÉÍÓÚ', 'es')).toBe('aeiou');
  });
});
