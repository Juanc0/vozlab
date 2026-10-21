/**
 * The name of a class or of a relation, in the language of the reader.
 *
 * The API sends the **whole map** of the names and the client picks the one
 * of its language. The chain is: the exact locale, its base language, and
 * the key of the system.
 */

import { describe, expect, it } from 'vitest';
import { displayName } from '$lib/i18n/display-name';

const NAMES = { en: 'Problem', es: 'Problema', 'es-MX': 'Problema de México' };

describe('the display name of a class or of a relation', () => {
  it('is the name of the exact locale', () => {
    expect(displayName(NAMES, 'es', 'Problem')).toBe('Problema');
    expect(displayName(NAMES, 'en', 'Problem')).toBe('Problem');
    expect(displayName(NAMES, 'es-MX', 'Problem')).toBe('Problema de México');
  });

  it('falls back to the base language of the locale', () => {
    expect(displayName(NAMES, 'es-AR', 'Problem')).toBe('Problema');
    expect(displayName(NAMES, 'en-GB', 'Problem')).toBe('Problem');
  });

  it('falls back to the key of the system when there is no name', () => {
    expect(displayName(NAMES, 'fr', 'Problem')).toBe('Problem');
    expect(displayName({}, 'es', 'RELATES_TO')).toBe('RELATES_TO');
  });

  it('ignores a name that is empty or only whitespace', () => {
    expect(displayName({ es: '' }, 'es', 'Problem')).toBe('Problem');
    expect(displayName({ es: '   ' }, 'es', 'Problem')).toBe('Problem');
    expect(displayName({ es: '', en: 'Problem' }, 'es', 'Problema')).toBe('Problema');
  });

  it('is never an empty string', () => {
    expect(displayName({}, 'es', 'Problem').trim()).not.toBe('');
    expect(displayName({ es: '  ' }, 'es', 'Problem').trim()).not.toBe('');
  });

  it('does not read the base language twice', () => {
    // `es` has no base of its own: the chain ends at the fallback.
    expect(displayName({ es: '' }, 'es', 'Problem')).toBe('Problem');
  });
});
