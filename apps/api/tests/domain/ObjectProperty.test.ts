import { DomainError } from '../../src/domain/errors/DomainError.js';
import { describe, expect, it } from 'vitest';
import { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';

function make(status: ObjectProperty['status'] = 'PROPOSED'): ObjectProperty {
  return new ObjectProperty(
    'p-1',
    'ws-1',
    'relatesTo',
    { es: 'Relaciona', en: 'Relates' },
    {},
    'Thing',
    'Thing',
    true,
    false,
    false,
    status
  );
}

describe('ObjectProperty', () => {
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