import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OntologyResponseDto } from '@vozlab/shared-types';
import { ActivateOntologyClassUseCase } from '../../src/application/use_cases/ActivateOntologyClassUseCase.js';
import { GetOntologyUseCase } from '../../src/application/use_cases/GetOntologyUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../src/application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../src/application/use_cases/ProposeObjectPropertyUseCase.js';
import { ProposeOntologyClassUseCase } from '../../src/application/use_cases/ProposeOntologyClassUseCase.js';
import { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';
import { OntologyClass } from '../../src/domain/entities/OntologyClass.js';
import { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';
import type { IMembershipRepository } from '../../src/domain/ports/IMembershipRepository.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import { OntologyController } from '../../src/infrastructure/http/controllers/OntologyController.js';
import { makeEventPublisher, makeOntologyRepository, makeUnitOfWork } from '../support/fakes.js';

const WS = 'ws-1';
const TID = 'tenant-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function property(
  id: string,
  systemKey: string,
  status: 'ACTIVE' | 'PROPOSED'
): DatatypeProperty {
  return new DatatypeProperty(
    id,
    WS,
    systemKey,
    { en: systemKey },
    { en: `The ${systemKey}` },
    'enum',
    ['low', 'high'],
    true,
    'low',
    'Problem',
    status,
    'author-hash',
    CREATED_AT
  );
}

function ontologyClass(): OntologyClass {
  return new OntologyClass(
    'cls-1',
    WS,
    'Problem',
    { en: 'Problem' },
    { en: 'A problem.' },
    null,
    'ACTIVE',
    'author-hash',
    CREATED_AT
  );
}

function objectProperty(): ObjectProperty {
  return new ObjectProperty(
    'op-1',
    WS,
    'RELATES_TO',
    { en: 'Relates to' },
    { en: 'Links two nodes.' },
    'Problem',
    'Idea',
    true,
    false,
    false,
    'ACTIVE',
    'author-hash',
    CREATED_AT
  );
}

const membershipRepo: IMembershipRepository = {
  async isMember() {
    return true;
  },
  async getRole() {
    return 'ADMIN';
  },
  async add() {},
  async changeRole() {},
  async suspend() {},
  async reactivate() {},
  async remove() {},
};

/** The controller under test, wired to an in-memory metamodel. */
function makeController(datatypeProperties: DatatypeProperty[]): OntologyController {
  const { repo: base } = makeOntologyRepository(null, datatypeProperties);
  const repo: IOntologyRepository = {
    ...base,
    async findActiveClasses() {
      return [ontologyClass()];
    },
    async findActiveObjectProperties() {
      return [objectProperty()];
    },
  };
  const { publisher } = makeEventPublisher();
  const { uow } = makeUnitOfWork();

  return new OntologyController(
    new ProposeOntologyClassUseCase(repo, publisher),
    new ProposeDatatypePropertyUseCase(repo, publisher),
    new ProposeObjectPropertyUseCase(repo, publisher),
    new ActivateOntologyClassUseCase(repo, membershipRepo, uow, publisher),
    new GetOntologyUseCase(repo)
  );
}

function makeRequest(): FastifyRequest {
  return {
    reqId: 'req-1',
    workspaceId: WS,
    tid: TID,
    user: { userId: 'user-1', authorHash: 'author-hash' },
  } as unknown as FastifyRequest;
}

/** Minimal reply double: it records the status and the body that was sent. */
function makeReply(captured: { statusCode: number; body: unknown }): FastifyReply {
  const reply = {
    status(code: number) {
      captured.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      captured.body = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

async function getOntology(controller: OntologyController) {
  const captured = { statusCode: 0, body: undefined as unknown };
  await controller.getOntologyHandler(makeRequest(), makeReply(captured));
  return captured;
}

describe('OntologyController — GET /api/v1/ontology', () => {
  it('carries the active datatype properties of the workspace', async () => {
    const controller = makeController([property('dtp-1', 'impact', 'ACTIVE')]);

    const captured = await getOntology(controller);

    expect(captured.statusCode).toBe(200);
    const body = captured.body as OntologyResponseDto;
    expect(body.datatypeProperties).toEqual([
      {
        id: 'dtp-1',
        workspaceId: WS,
        systemKey: 'impact',
        displayNames: { en: 'impact' },
        descriptions: { en: 'The impact' },
        datatype: 'enum',
        allowedValues: ['low', 'high'],
        isRequired: true,
        defaultValue: 'low',
        domainClassKey: 'Problem',
        status: 'ACTIVE',
        proposedBy: 'author-hash',
        createdAt: CREATED_AT.toISOString(),
      },
    ]);
  });

  it('keeps the classes and the object properties it already returned', async () => {
    const controller = makeController([property('dtp-1', 'impact', 'ACTIVE')]);

    const captured = await getOntology(controller);

    const body = captured.body as OntologyResponseDto;
    expect(body.classes).toHaveLength(1);
    expect(body.classes[0].systemKey).toBe('Problem');
    expect(body.objectProperties).toHaveLength(1);
    expect(body.objectProperties[0].systemKey).toBe('RELATES_TO');
  });

  it('never exposes a property that is still awaiting approval', async () => {
    const controller = makeController([
      property('dtp-active', 'impact', 'ACTIVE'),
      property('dtp-proposed', 'severity', 'PROPOSED'),
    ]);

    const captured = await getOntology(controller);

    const body = captured.body as OntologyResponseDto;
    expect(body.datatypeProperties.map((prop) => prop.id)).toEqual(['dtp-active']);
    expect(JSON.stringify(body)).not.toContain('severity');
  });
});
