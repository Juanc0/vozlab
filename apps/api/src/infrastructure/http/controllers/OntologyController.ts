import { FastifyRequest, FastifyReply } from 'fastify';
import {
  ProposeOntologyClassSchema,
  ProposeDatatypePropertySchema,
  ProposeObjectPropertySchema,
} from '@vozlab/shared-types';
import { ProposeOntologyClassUseCase } from '../../../application/use_cases/ProposeOntologyClassUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../../application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../../application/use_cases/ProposeObjectPropertyUseCase.js';
import { ActivateOntologyClassUseCase } from '../../../application/use_cases/ActivateOntologyClassUseCase.js';
import { GetOntologyUseCase } from '../../../application/use_cases/GetOntologyUseCase.js';
import { OntologyClass } from '../../../domain/entities/OntologyClass.js';
import { ObjectProperty } from '../../../domain/entities/ObjectProperty.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of an OntologyClass. Never leaks internal state
 * beyond what consumers need to render the metamodel.
 */
interface OntologyClassDto {
  id: string;
  workspaceId: string | null;
  systemKey: string;
  displayNames: Record<string, string>;
  descriptions: Record<string, string>;
  parentClassKey: string | null;
  status: string;
  proposedBy: string;
  createdAt: string;
}

/**
 * Stable JSON projection of an ObjectProperty (domain/range typed relation).
 */
interface ObjectPropertyDto {
  id: string;
  workspaceId: string | null;
  systemKey: string;
  displayNames: Record<string, string>;
  descriptions: Record<string, string>;
  domainClassKey: string;
  rangeClassKey: string;
  isDirectional: boolean;
  isSymmetric: boolean;
  allowsSelfRelation: boolean;
  status: string;
  proposedBy: string;
  createdAt: string;
}

function toOntologyClassDto(cls: OntologyClass): OntologyClassDto {
  return {
    id: cls.id,
    workspaceId: cls.workspaceId,
    systemKey: cls.systemKey,
    displayNames: cls.displayNames,
    descriptions: cls.descriptions,
    parentClassKey: cls.parentClassKey,
    status: cls.status,
    proposedBy: cls.proposedBy,
    createdAt: cls.createdAt.toISOString(),
  };
}

function toObjectPropertyDto(prop: ObjectProperty): ObjectPropertyDto {
  return {
    id: prop.id,
    workspaceId: prop.workspaceId,
    systemKey: prop.systemKey,
    displayNames: prop.displayNames,
    descriptions: prop.descriptions,
    domainClassKey: prop.domainClassKey,
    rangeClassKey: prop.rangeClassKey,
    isDirectional: prop.isDirectional,
    isSymmetric: prop.isSymmetric,
    allowsSelfRelation: prop.allowsSelfRelation,
    status: prop.status,
    proposedBy: prop.proposedBy,
    createdAt: prop.createdAt.toISOString(),
  };
}

/**
 * OntologyController: HTTP adapter for the collaborative ontology metamodel
 * (FR-06 datatype properties, FR-08 object properties, FR-09 classes).
 */
export class OntologyController {
  constructor(
    private readonly proposeClass: ProposeOntologyClassUseCase,
    private readonly proposeDatatypeProperty: ProposeDatatypePropertyUseCase,
    private readonly proposeObjectProperty: ProposeObjectPropertyUseCase,
    private readonly activateOntologyClass: ActivateOntologyClassUseCase,
    private readonly getOntology: GetOntologyUseCase
  ) {}

  /** POST /api/v1/ontology/classes */
  async proposeClassHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ProposeOntologyClassSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const cls = await this.proposeClass.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        proposerHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: cls.id,
        systemKey: cls.systemKey,
        status: cls.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'proposeOntologyClass failed');
    }
  }

  /** POST /api/v1/ontology/datatype-properties */
  async proposeDatatypePropertyHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = ProposeDatatypePropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.proposeDatatypeProperty.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        proposerHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'proposeDatatypeProperty failed');
    }
  }

  /** POST /api/v1/ontology/object-properties */
  async proposeObjectPropertyHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const parsed = ProposeObjectPropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.proposeObjectProperty.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        proposerHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'proposeObjectProperty failed');
    }
  }

  /** PUT /api/v1/ontology/classes/:id/activate */
  async activateClassHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const classId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const cls = await this.activateOntologyClass.execute({
        classId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: cls.id,
        systemKey: cls.systemKey,
        status: cls.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'activateOntologyClass failed');
    }
  }

  /** GET /api/v1/ontology */
  async getOntologyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { classes, objectProperties } = await this.getOntology.execute({
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
      });

      return reply.status(200).send({
        classes: classes.map(toOntologyClassDto),
        objectProperties: objectProperties.map(toObjectPropertyDto),
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'getOntology failed');
    }
  }

  private handleError(
    req: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
    op: string
  ): void {
    log.error(
      { err: error instanceof Error ? error.message : error, reqId: req.reqId },
      op
    );
    return sendError(reply, mapDomainError(error));
  }
}
