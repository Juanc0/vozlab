import { FastifyRequest, FastifyReply } from 'fastify';
import {
  ProposeOntologyClassSchema,
  ProposeDatatypePropertySchema,
  ProposeObjectPropertySchema,
  type DatatypePropertyDto,
  type OntologyClassDto,
  type ObjectPropertyDto,
  type OntologyResponseDto,
} from '@vozlab/shared-types';
import { ProposeOntologyClassUseCase } from '../../../application/use_cases/ProposeOntologyClassUseCase.js';
import { ProposeDatatypePropertyUseCase } from '../../../application/use_cases/ProposeDatatypePropertyUseCase.js';
import { ProposeObjectPropertyUseCase } from '../../../application/use_cases/ProposeObjectPropertyUseCase.js';
import { ActivateOntologyClassUseCase } from '../../../application/use_cases/ActivateOntologyClassUseCase.js';
import { GetOntologyUseCase } from '../../../application/use_cases/GetOntologyUseCase.js';
import { OntologyClass } from '../../../domain/entities/OntologyClass.js';
import { DatatypeProperty } from '../../../domain/entities/DatatypeProperty.js';
import { ObjectProperty } from '../../../domain/entities/ObjectProperty.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of an OntologyClass. Never leaks internal state
 * beyond what consumers need to render the metamodel.
 *
 * The shape itself lives in `@vozlab/shared-types` (`OntologyClassDto`) so
 * the PWA can type the responses it consumes.
 */
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

/**
 * Stable JSON projection of an ObjectProperty (domain/range typed relation).
 *
 * The shape itself lives in `@vozlab/shared-types` (`ObjectPropertyDto`) so
 * the PWA can type the responses it consumes.
 */
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
 * Stable JSON projection of a DatatypeProperty (scalar attribute of a class).
 *
 * It carries what the dynamic node-creation form needs (FR-06): the scalar
 * kind, the enum domain, the required flag and the default value.
 *
 * The shape itself lives in `@vozlab/shared-types` (`DatatypePropertyDto`) so
 * the PWA can type the responses it consumes.
 */
function toDatatypePropertyDto(prop: DatatypeProperty): DatatypePropertyDto {
  return {
    id: prop.id,
    workspaceId: prop.workspaceId,
    systemKey: prop.systemKey,
    displayNames: prop.displayNames,
    descriptions: prop.descriptions,
    datatype: prop.datatype,
    allowedValues: prop.allowedValues,
    isRequired: prop.isRequired,
    defaultValue: prop.defaultValue,
    domainClassKey: prop.domainClassKey,
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
      const { classes, objectProperties, datatypeProperties } = await this.getOntology.execute({
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
      });

      return reply.status(200).send({
        classes: classes.map(toOntologyClassDto),
        objectProperties: objectProperties.map(toObjectPropertyDto),
        datatypeProperties: datatypeProperties.map(toDatatypePropertyDto),
      } satisfies OntologyResponseDto);
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
