import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
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
import { RejectOntologyClassUseCase } from '../../../application/use_cases/RejectOntologyClassUseCase.js';
import { ActivateDatatypePropertyUseCase } from '../../../application/use_cases/ActivateDatatypePropertyUseCase.js';
import { RejectDatatypePropertyUseCase } from '../../../application/use_cases/RejectDatatypePropertyUseCase.js';
import { ActivateObjectPropertyUseCase } from '../../../application/use_cases/ActivateObjectPropertyUseCase.js';
import { RejectObjectPropertyUseCase } from '../../../application/use_cases/RejectObjectPropertyUseCase.js';
import { DeprecateOntologyClassUseCase } from '../../../application/use_cases/DeprecateOntologyClassUseCase.js';
import { DeprecateDatatypePropertyUseCase } from '../../../application/use_cases/DeprecateDatatypePropertyUseCase.js';
import { DeprecateObjectPropertyUseCase } from '../../../application/use_cases/DeprecateObjectPropertyUseCase.js';
import { GetOntologyUseCase } from '../../../application/use_cases/GetOntologyUseCase.js';
import { IOntologyRepository } from '../../../domain/ports/IOntologyRepository.js';
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
    communityScore: cls.communityScore,
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
    communityScore: prop.communityScore,
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
    communityScore: prop.communityScore,
  };
}

/**
 * OntologyController: HTTP adapter for the collaborative ontology metamodel
 * (FR-06 datatype properties, FR-08 object properties, FR-09 classes).
 */
export class OntologyController {
  private proposeClass!: ProposeOntologyClassUseCase;
  private proposeDatatypeProperty!: ProposeDatatypePropertyUseCase;
  private proposeObjectProperty!: ProposeObjectPropertyUseCase;
  private activateOntologyClass!: ActivateOntologyClassUseCase;
  private rejectOntologyClass!: RejectOntologyClassUseCase;
  private deprecateOntologyClass!: DeprecateOntologyClassUseCase;
  private activateDatatypeProperty!: ActivateDatatypePropertyUseCase;
  private rejectDatatypeProperty!: RejectDatatypePropertyUseCase;
  private deprecateDatatypeProperty!: DeprecateDatatypePropertyUseCase;
  private activateObjectProperty!: ActivateObjectPropertyUseCase;
  private rejectObjectProperty!: RejectObjectPropertyUseCase;
  private deprecateObjectProperty!: DeprecateObjectPropertyUseCase;
  private getOntology!: GetOntologyUseCase;
  private ontologyRepo?: IOntologyRepository;

  constructor(...args: unknown[]) {
    for (const arg of args) {
      if (!arg || typeof arg !== 'object') continue;
      const name = (arg as { constructor?: { name?: string } }).constructor?.name;
      switch (name) {
        case 'ProposeOntologyClassUseCase':
          this.proposeClass = arg as ProposeOntologyClassUseCase;
          break;
        case 'ProposeDatatypePropertyUseCase':
          this.proposeDatatypeProperty = arg as ProposeDatatypePropertyUseCase;
          break;
        case 'ProposeObjectPropertyUseCase':
          this.proposeObjectProperty = arg as ProposeObjectPropertyUseCase;
          break;
        case 'ActivateOntologyClassUseCase':
          this.activateOntologyClass = arg as ActivateOntologyClassUseCase;
          break;
        case 'RejectOntologyClassUseCase':
          this.rejectOntologyClass = arg as RejectOntologyClassUseCase;
          break;
        case 'DeprecateOntologyClassUseCase':
          this.deprecateOntologyClass = arg as DeprecateOntologyClassUseCase;
          break;
        case 'ActivateDatatypePropertyUseCase':
          this.activateDatatypeProperty = arg as ActivateDatatypePropertyUseCase;
          break;
        case 'RejectDatatypePropertyUseCase':
          this.rejectDatatypeProperty = arg as RejectDatatypePropertyUseCase;
          break;
        case 'DeprecateDatatypePropertyUseCase':
          this.deprecateDatatypeProperty = arg as DeprecateDatatypePropertyUseCase;
          break;
        case 'ActivateObjectPropertyUseCase':
          this.activateObjectProperty = arg as ActivateObjectPropertyUseCase;
          break;
        case 'RejectObjectPropertyUseCase':
          this.rejectObjectProperty = arg as RejectObjectPropertyUseCase;
          break;
        case 'DeprecateObjectPropertyUseCase':
          this.deprecateObjectProperty = arg as DeprecateObjectPropertyUseCase;
          break;
        case 'GetOntologyUseCase':
          this.getOntology = arg as GetOntologyUseCase;
          break;
        default:
          if (
            typeof (arg as { findClassById?: unknown }).findClassById ===
            'function'
          ) {
            this.ontologyRepo = arg as IOntologyRepository;
          }
          break;
      }
    }
  }

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

  /** PUT /api/v1/ontology/classes/:id/reject */
  async rejectClassHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const classId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const cls = await this.rejectOntologyClass.execute({
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
      return this.handleError(req, reply, error, 'rejectOntologyClass failed');
    }
  }

  /** PUT /api/v1/ontology/datatype-properties/:id/activate */
  async activateDatatypePropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.activateDatatypeProperty.execute({
        propertyId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'activateDatatypeProperty failed');
    }
  }

  /** PUT /api/v1/ontology/datatype-properties/:id/reject */
  async rejectDatatypePropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.rejectDatatypeProperty.execute({
        propertyId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'rejectDatatypeProperty failed');
    }
  }

  /** PUT /api/v1/ontology/object-properties/:id/activate */
  async activateObjectPropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.activateObjectProperty.execute({
        propertyId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'activateObjectProperty failed');
    }
  }

  /** PUT /api/v1/ontology/object-properties/:id/reject */
  async rejectObjectPropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.rejectObjectProperty.execute({
        propertyId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'rejectObjectProperty failed');
    }
  }

  /** PUT /api/v1/ontology/classes/:id/deprecate */
  async deprecateClassHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const classId = (req.params as { id: string }).id;
    const parsed = z.object({ migrationTargetKey: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const cls = await this.deprecateOntologyClass.execute({
        id: classId,
        migrationTargetKey: parsed.data.migrationTargetKey,
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
        migrationTargetKey: cls.migrationTargetKey,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'deprecateOntologyClass failed');
    }
  }

  /** PUT /api/v1/ontology/datatype-properties/:id/deprecate */
  async deprecateDatatypePropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;
    const parsed = z.object({ migrationTargetKey: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.deprecateDatatypeProperty.execute({
        id: propertyId,
        migrationTargetKey: parsed.data.migrationTargetKey,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
        migrationTargetKey: prop.migrationTargetKey,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'deprecateDatatypeProperty failed');
    }
  }

  /** PUT /api/v1/ontology/object-properties/:id/deprecate */
  async deprecateObjectPropertyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const propertyId = (req.params as { id: string }).id;
    const parsed = z.object({ migrationTargetKey: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const prop = await this.deprecateObjectProperty.execute({
        id: propertyId,
        migrationTargetKey: parsed.data.migrationTargetKey,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        resolverUserId: ctx.userId,
        resolverHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({
        id: prop.id,
        systemKey: prop.systemKey,
        status: prop.status,
        migrationTargetKey: prop.migrationTargetKey,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'deprecateObjectProperty failed');
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

  /** GET /api/v1/ontology/proposals */
  async listProposalsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');
    if (!this.ontologyRepo) return sendError(reply, 'ERR_SERVICE_UNAVAILABLE');

    try {
      const [classes, datatypeProperties, objectProperties] = await Promise.all([
        this.ontologyRepo.findProposedClasses(ctx.workspaceId, ctx.tid),
        this.ontologyRepo.findProposedDatatypeProperties(ctx.workspaceId, ctx.tid),
        this.ontologyRepo.findProposedObjectProperties(ctx.workspaceId, ctx.tid),
      ]);

      return reply.status(200).send({
        classes: classes.map(toOntologyClassDto),
        datatypeProperties: datatypeProperties.map(toDatatypePropertyDto),
        objectProperties: objectProperties.map(toObjectPropertyDto),
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listOntologyProposals failed');
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
