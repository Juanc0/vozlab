import { describe, expect, it } from 'vitest';

import { DeprecateDatatypePropertyUseCase } from '../../src/application/use_cases/DeprecateDatatypePropertyUseCase.js';
import { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEventPublisher, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function datatypeProperty(
  id: string,
  workspaceId: string,
  proposedBy: string,
  status: 'PROPOSED' | 'ACTIVE' | 'REJECTED' | 'DEPRECATED' = 'ACTIVE'
): DatatypeProperty {
  return new DatatypeProperty(
    id,
    workspaceId,
    'title',
    { en: 'Title' },
    { en: 'A title.' },
    'string',
    null,
    false,
    null,
    'Problem',
    status,
    proposedBy,
    CREATED_AT
  );
}

function makeRoles(roles: string[]) {
  return {
    async getRole() {
      return roles[0] ?? null;
    },
    async getRoles() {
      return roles;
    },
    async isMember() {
      return roles.length > 0;
    },
    async add() {},
    async changeRole() {},
    async suspend() {},
    async reactivate() {},
    async remove() {},
  };
}

function build(properties: DatatypeProperty[], roles: string[]) {
  const ontology = makeOntologyRepository(null, properties, []);
  const membershipRepo = makeRoles(roles) as never;
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const useCase = new DeprecateDatatypePropertyUseCase(
    ontology.repo,
    membershipRepo,
    uow,
    publisher
  );
  return { useCase, ontology, ran, events };
}

const baseInput = {
  propertyId: 'prop-1',
  workspaceId: WS,
  tid: TID,
  resolverUserId: 'user-1',
  migrationTargetKey: 'headline',
};

describe('DeprecateDatatypePropertyUseCase', () => {
  it('lets a moderator deprecate an active property and publishes the event', async () => {
    const { useCase, ontology, ran, events } = build(
      [datatypeProperty('prop-1', WS, 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'mod-hash',
    });
    expect(result.status).toBe('DEPRECATED');
    expect(ontology.deprecated).toEqual(['prop-1']);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['ONTOLOGY_PROPERTY_DEPRECATED']);
  });

  it('rejects a non-moderator', async () => {
    const { useCase, ontology, events } = build(
      [datatypeProperty('prop-1', WS, 'other-hash', 'ACTIVE')],
      ['MEMBER']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a missing property as ERR_DATATYPE_PROPERTY_NOT_FOUND', async () => {
    const { useCase, ontology, events } = build([], ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_DATATYPE_PROPERTY_NOT_FOUND' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a proposed property as ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase, ontology, events } = build(
      [datatypeProperty('prop-1', WS, 'other-hash', 'PROPOSED')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports an empty migration target as ERR_VALIDATION_FAILED', async () => {
    const { useCase, ontology, events } = build(
      [datatypeProperty('prop-1', WS, 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, migrationTargetKey: '', resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a foreign-workspace property as ERR_DATATYPE_PROPERTY_NOT_FOUND', async () => {
    const { useCase, ontology, events } = build(
      [datatypeProperty('prop-1', 'ws-other', 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_DATATYPE_PROPERTY_NOT_FOUND' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});