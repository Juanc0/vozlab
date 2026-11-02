import { describe, expect, it } from 'vitest';

import { RejectDatatypePropertyUseCase } from '../../src/application/use_cases/RejectDatatypePropertyUseCase.js';
import { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';
import { makeEventPublisher, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function property(
  id: string,
  workspaceId: string,
  proposedBy: string,
  status: 'PROPOSED' | 'ACTIVE' | 'REJECTED' = 'PROPOSED'
): DatatypeProperty {
  return new DatatypeProperty(
    id,
    workspaceId,
    'name',
    { es: 'Nombre', en: 'Name' },
    { es: 'desc', en: 'desc' },
    'string',
    null,
    false,
    null,
    'Person',
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

function build(props: DatatypeProperty[], roles: string[]) {
  const ontology = makeOntologyRepository(null, props);
  const membershipRepo = makeRoles(roles) as never;
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const useCase = new RejectDatatypePropertyUseCase(
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
};

describe('RejectDatatypePropertyUseCase', () => {
  it('lets the author reject their own proposed property', async () => {
    const { useCase, ontology, ran, events } = build(
      [property('prop-1', WS, 'author-hash')],
      []
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'author-hash',
    });
    expect(result.status).toBe('REJECTED');
    expect(ontology.rejected).toEqual(['prop-1']);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['DATATYPE_PROPERTY_REJECTED']);
  });

  it('lets a moderator reject another user property', async () => {
    const { useCase, ontology, events } = build(
      [property('prop-1', WS, 'other-hash')],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'mod-hash',
    });
    expect(result.status).toBe('REJECTED');
    expect(ontology.rejected).toEqual(['prop-1']);
    expect(events).toEqual(['DATATYPE_PROPERTY_REJECTED']);
  });

  it('rejects a non-author non-moderator', async () => {
    const { useCase, ontology, events } = build(
      [property('prop-1', WS, 'other-hash')],
      ['MEMBER']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(ontology.rejected).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a missing property as ERR_VALIDATION_FAILED', async () => {
    const { useCase, ontology } = build([], []);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'author-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(ontology.rejected).toHaveLength(0);
  });

  it('rejects rejecting an already-active property with ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase } = build([property('prop-1', WS, 'other-hash', 'ACTIVE')], ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
  });

  it('reports foreign workspace as missing (404)', async () => {
    const { useCase } = build([property('prop-1', 'ws-other', 'author-hash')], ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
  });
});
