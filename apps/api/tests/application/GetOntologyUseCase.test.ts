import { describe, expect, it } from 'vitest';
import { GetOntologyUseCase } from '../../src/application/use_cases/GetOntologyUseCase.js';
import { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';

const WS = 'ws-1';
const TID = 'tenant-1';

type PropertyStatus = 'ACTIVE' | 'PROPOSED' | 'REJECTED';

function property(
  id: string,
  systemKey: string,
  status: PropertyStatus,
  datatype: 'string' | 'enum' = 'string'
): DatatypeProperty {
  return new DatatypeProperty(
    id,
    WS,
    systemKey,
    { en: systemKey },
    { en: `The ${systemKey}` },
    datatype,
    datatype === 'enum' ? ['a', 'b'] : null,
    false,
    null,
    'Problem',
    status,
    'author-hash',
    new Date('2026-01-01T00:00:00.000Z')
  );
}

/**
 * A repository whose `findActiveDatatypeProperties` returns whatever it is
 * given — the "leaky adapter" of the governance tests below.
 */
function makeRepo(datatypeProperties: DatatypeProperty[]): IOntologyRepository {
  return {
    async findClassById() {
      return null;
    },
    async findClassByKey() {
      return null;
    },
    async findActiveClasses() {
      return [];
    },
    async findDatatypeProperties() {
      return datatypeProperties;
    },
    async findActiveDatatypeProperties() {
      return datatypeProperties;
    },
    async findObjectProperty() {
      return null;
    },
    async findActiveObjectProperties() {
      return [];
    },
    async saveClass() {},
    async saveDatatypeProperty() {},
    async saveObjectProperty() {},
    async applyClassDelta() {},
    async activateClass() {},
  };
}

const input = { workspaceId: WS, tid: TID };

describe('GetOntologyUseCase', () => {
  it('returns the datatype properties of the workspace', async () => {
    const active = property('dtp-1', 'title', 'ACTIVE');
    const useCase = new GetOntologyUseCase(makeRepo([active]));

    const result = await useCase.execute(input);

    expect(result.datatypeProperties).toHaveLength(1);
    expect(result.datatypeProperties[0]).toBe(active);
  });

  it('scopes the read to the workspace and the tenant', async () => {
    const calls: Array<[string, string]> = [];
    const repo = makeRepo([]);
    const useCase = new GetOntologyUseCase({
      ...repo,
      async findActiveDatatypeProperties(workspaceId, tid) {
        calls.push([workspaceId, tid]);
        return [];
      },
    });

    await useCase.execute(input);

    expect(calls).toEqual([[WS, TID]]);
  });

  it('never returns a property that is not ACTIVE (governance invariant)', async () => {
    // The adapter is deliberately leaky: the invariant must hold even then.
    const useCase = new GetOntologyUseCase(
      makeRepo([
        property('dtp-active', 'title', 'ACTIVE'),
        property('dtp-proposed', 'impact', 'PROPOSED'),
        property('dtp-rejected', 'legacy', 'REJECTED'),
      ])
    );

    const result = await useCase.execute(input);

    expect(result.datatypeProperties.map((prop) => prop.id)).toEqual(['dtp-active']);
  });
});
