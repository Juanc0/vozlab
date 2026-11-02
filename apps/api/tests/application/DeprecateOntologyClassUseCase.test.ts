import { describe, expect, it } from 'vitest';

import { DeprecateOntologyClassUseCase } from '../../src/application/use_cases/DeprecateOntologyClassUseCase.js';
import { OntologyClass } from '../../src/domain/entities/OntologyClass.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEventPublisher, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function ontologyClass(
  id: string,
  workspaceId: string,
  proposedBy: string,
  status: 'PROPOSED' | 'ACTIVE' | 'REJECTED' | 'DEPRECATED' = 'ACTIVE'
): OntologyClass {
  return new OntologyClass(
    id,
    workspaceId,
    'Problem',
    { en: 'Problem' },
    { en: 'A problem.' },
    null,
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

function build(classes: OntologyClass[], roles: string[]) {
  const ontology = makeOntologyRepository(null, [], classes);
  const membershipRepo = makeRoles(roles) as never;
  const { uow, ran } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const useCase = new DeprecateOntologyClassUseCase(
    ontology.repo,
    membershipRepo,
    uow,
    publisher
  );
  return { useCase, ontology, ran, events };
}

const baseInput = {
  classId: 'class-1',
  workspaceId: WS,
  tid: TID,
  resolverUserId: 'user-1',
  migrationTargetKey: 'Issue',
};

describe('DeprecateOntologyClassUseCase', () => {
  it('lets a moderator deprecate an active class and publishes the event', async () => {
    const { useCase, ontology, ran, events } = build(
      [ontologyClass('class-1', WS, 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'mod-hash',
    });
    expect(result.status).toBe('DEPRECATED');
    expect(ontology.deprecated).toEqual(['class-1']);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['ONTOLOGY_CLASS_DEPRECATED']);
  });

  it('lets an admin deprecate an active class', async () => {
    const { useCase, ontology, events } = build(
      [ontologyClass('class-1', WS, 'other-hash', 'ACTIVE')],
      ['ADMIN']
    );
    const result = await useCase.execute({
      ...baseInput,
      resolverHash: 'admin-hash',
    });
    expect(result.status).toBe('DEPRECATED');
    expect(ontology.deprecated).toEqual(['class-1']);
    expect(events).toEqual(['ONTOLOGY_CLASS_DEPRECATED']);
  });

  it('rejects a non-moderator', async () => {
    const { useCase, ontology, events } = build(
      [ontologyClass('class-1', WS, 'other-hash', 'ACTIVE')],
      ['MEMBER']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a missing class as ERR_VALIDATION_FAILED', async () => {
    const { useCase, ontology, events } = build([], ['MODERATOR']);
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports an already-deprecated class as ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase, ontology, events } = build(
      [ontologyClass('class-1', WS, 'other-hash', 'DEPRECATED')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_INVALID_STATE_TRANSITION' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a proposed class as ERR_INVALID_STATE_TRANSITION', async () => {
    const { useCase, ontology, events } = build(
      [ontologyClass('class-1', WS, 'other-hash', 'PROPOSED')],
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
      [ontologyClass('class-1', WS, 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, migrationTargetKey: '', resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('reports a foreign-workspace class as ERR_VALIDATION_FAILED', async () => {
    const { useCase, ontology, events } = build(
      [ontologyClass('class-1', 'ws-other', 'other-hash', 'ACTIVE')],
      ['MODERATOR']
    );
    await expect(
      useCase.execute({ ...baseInput, resolverHash: 'mod-hash' })
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION_FAILED' });
    expect(ontology.deprecated).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});