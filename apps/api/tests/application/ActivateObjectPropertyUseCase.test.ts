import { describe, expect, it } from 'vitest';

import { ActivateObjectPropertyUseCase } from '../../src/application/use_cases/ActivateObjectPropertyUseCase.js';
import { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEventPublisher, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function objectProperty(
  id: string,
  workspaceId: string,
  proposedBy: string,
  status: 'PROPOSED' | 'ACTIVE' | 'REJECTED' = 'PROPOSED',
  displayNames: Record<string, string> = { es: 'Relacion', en: 'Relation' }
): ObjectProperty {
  return new ObjectProperty(
    id,
    workspaceId,
    'knows',
    displayNames,
    { es: 'desc', en: 'desc' },
    'Person',
    'Organization',
    true,
    false,
    false,
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

function build(prop: ObjectProperty, roles: string[]) {
  const ontology = makeOntologyRepository(prop, []);
  const membershipRepo = makeRoles(roles) as never;
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const useCase = new ActivateObjectPropertyUseCase(
    ontology.repo,
    membershipRepo,
    uow,
    publisher
  );
  return { useCase, ontology, ran, events };
}

const baseInput = {
  propertyId: 'obj-1',
  workspaceId: WS,
  tid: TID,
  resolverUserId: 'user-1',
};

describe('ActivateObjectPropertyUseCase', () => {
  it('lets the author activate their own property', async () => {
    const { useCase, ontology, ran, events } = build(
      objectProperty('obj-1', WS, 'author-hash'),
      []
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'author-hash',
    });
    expect(result.status).toBe('ACTIVE');
    expect(ontology.activated).toEqual(['obj-1']);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['OBJECT_PROPERTY_ACTIVATED']);
  });

  it('lets a moderator activate another user property', async () => {
    const { useCase, ontology, events } = build(
      objectProperty('obj-1', WS, 'other-hash'),
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'mod-hash',
    });
    expect(result.status).toBe('ACTIVE');
    expect(ontology.activated).toEqual(['obj-1']);
    expect(events).toEqual(['OBJECT_PROPERTY_ACTIVATED']);
  });

  it('rejects a non-author non-moderator', async () => {
    const { useCase, ontology, events } = build(
      objectProperty('obj-1', WS, 'other-hash'),
      ['MEMBER']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(ontology.activated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a missing property as ERR_OBJECT_PROPERTY_NOT_FOUND', async () => {
    const { useCase } = build(objectProperty('obj-2', WS, 'other-hash'), ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, propertyId: 'obj-1', resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_OBJECT_PROPERTY_NOT_FOUND' });
  });

  it('rejects activating an already-active property with ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase } = build(
      objectProperty('obj-1', WS, 'other-hash', 'ACTIVE'),
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
  });

  it('reports foreign workspace as missing (404)', async () => {
    const { useCase } = build(objectProperty('obj-1', 'ws-other', 'author-hash'), ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_OBJECT_PROPERTY_NOT_FOUND' });
  });

  it('rejects activation with locale incomplete as ERR_LOCALE_INCOMPLETE', async () => {
    const { useCase, ontology } = build(
      objectProperty('obj-1', WS, 'other-hash', 'PROPOSED', { es: 'Relacion' }),
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_LOCALE_INCOMPLETE' });
    expect(ontology.activated).toHaveLength(0);
  });
});
