import { describe, expect, it } from 'vitest';

import { ActivateOntologyClassUseCase } from '../../src/application/use_cases/ActivateOntologyClassUseCase.js';
import { OntologyClass } from '../../src/domain/entities/OntologyClass.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeEventPublisher, makeInteractionRepository, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function ontologyClass(
  id: string,
  workspaceId: string,
  proposedBy: string,
  status: 'PROPOSED' | 'ACTIVE' | 'REJECTED' = 'PROPOSED'
): OntologyClass {
  return new OntologyClass(
    id,
    workspaceId,
    'Problem',
    { en: 'Problem', es: 'Problema' },
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

function build(classes: OntologyClass[], roles: string[], supporters: number | string[] = 3) {
  const ontology = makeOntologyRepository(null, [], classes);
  const membershipRepo = makeRoles(roles) as never;
  const { uow } = makeUnitOfWork();
  const { publisher, events } = makeEventPublisher();
  const { repo: interactionRepo } = makeInteractionRepository(supporters);
  const useCase = new ActivateOntologyClassUseCase(
    ontology.repo,
    interactionRepo,
    membershipRepo,
    uow,
    publisher
  );
  return { useCase, ontology, events };
}

const input = {
  classId: 'class-1',
  workspaceId: WS,
  tid: TID,
  resolverUserId: 'user-1',
  resolverHash: 'hash-1',
};

describe('ActivateOntologyClassUseCase', () => {
  it('rejects a user whose roles are not moderator/admin', async () => {
    const { useCase } = build([ontologyClass('class-1', WS, 'other-hash')], ['MEMBER', 'GUEST']);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_AUTHORIZATION_FAILED',
    });
  });

  it('passes the role gate for a user holding MEMBER + MODERATOR (union)', async () => {
    const { useCase } = build([], ['MEMBER', 'MODERATOR']);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_VALIDATION_FAILED',
    });
  });

  it('throws ERR_UNMET_QUORUM with 0 supporters', async () => {
    const { useCase } = build([ontologyClass('class-1', WS, 'other-hash')], ['MODERATOR'], 0);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_UNMET_QUORUM',
    });
  });

  it('reaches the state machine with >=3 supporters', async () => {
    const { useCase } = build([ontologyClass('class-1', WS, 'other-hash')], ['MODERATOR'], 3);
    const result = await useCase.execute(input);
    expect(result.id).toBe('class-1');
  });
});
