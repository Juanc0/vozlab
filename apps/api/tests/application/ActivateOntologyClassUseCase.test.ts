import { describe, expect, it } from 'vitest';

import { ActivateOntologyClassUseCase } from '../../src/application/use_cases/ActivateOntologyClassUseCase.js';
import { DomainError } from '../../src/domain/errors/DomainError.js';
import { makeOntologyRepository, makeUnitOfWork, makeEventPublisher } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';

function build(roles: string[]) {
  const ontology = makeOntologyRepository();
  const membershipRepo = {
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
  const { uow } = makeUnitOfWork();
  const { publisher } = makeEventPublisher();
  const useCase = new ActivateOntologyClassUseCase(
    ontology.repo,
    membershipRepo as never,
    uow,
    publisher
  );
  return useCase;
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
    const useCase = build(['MEMBER', 'GUEST']);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_AUTHORIZATION_FAILED',
    });
  });

  it('passes the role gate for a user holding MEMBER + MODERATOR (union)', async () => {
    const useCase = build(['MEMBER', 'MODERATOR']);
    // Role gate passes; the class is not found in the (empty) fake repo.
    await expect(useCase.execute(input)).rejects.toMatchObject({
      code: 'ERR_VALIDATION_FAILED',
    });
  });
});
