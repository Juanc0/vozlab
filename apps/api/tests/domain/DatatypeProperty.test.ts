import { DomainError } from '../../src/domain/errors/DomainError.js';
import { describe, expect, it } from 'vitest';
import { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';

function make(status: DatatypeProperty['status'] = 'PROPOSED'): DatatypeProperty {
  return new DatatypeProperty(
    'p-1',
    'ws-1',
    'name',
    { es: 'Nombre', en: 'Name' },
    {},
    'string',
    null,
    false,
    null,
    'Thing',
    status
  );
}

describe('DatatypeProperty', () => {
  it('rejects a PROPOSED property', () => {
    const prop = make('PROPOSED');
    prop.reject();
    expect(prop.status).toBe('REJECTED');
  });

  it('throws ERR_INVALID_STATE_TRANSITION when not PROPOSED', () => {
    const prop = make('ACTIVE');
    try {
      prop.reject();
      expect.unreachable('expected reject to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('ERR_INVALID_STATE_TRANSITION');
    }
    expect(prop.status).toBe('ACTIVE');
  });
});