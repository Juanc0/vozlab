import { randomBytes } from 'node:crypto';
import { DomainError } from '../../domain/errors/DomainError.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceWithStats,
} from '../../domain/ports/IWorkspaceRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';
import {
  baseOntologyClasses,
  baseOntologyRelations,
} from './BaseOntology.js';

export interface CreateWorkspaceInput {
  actorUserId: string;
  actorAuthorHash: string;
  tid: string;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  kind?: string;
  reqId?: string;
}

/** A random, rotatable routing hint (never an access grant). */
export function generateJoinCode(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Use Case: create a workspace in the caller's tenant (US-00).
 *
 * One transaction provisions the row, its base ontology and the creator's
 * ADMIN membership: a workspace can never exist without an administrator or
 * without the metamodel that makes it usable.
 */
export class CreateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork
  ) {}

  async execute(input: CreateWorkspaceInput): Promise<WorkspaceWithStats> {
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo);

    const existing = await this.workspaceRepo.findBySlug(input.slug, input.tid);
    if (existing) {
      throw new DomainError('ERR_WORKSPACE_SLUG_TAKEN');
    }

    const workspace = await this.uow.runInTransaction(input.tid, async (tx) => {
      const created = await this.workspaceRepo.create(
        {
          slug: input.slug,
          name: input.name,
          description: input.description,
          isPublic: input.isPublic,
          kind: input.kind ?? 'PRIVATE',
          joinCode: generateJoinCode(),
        },
        input.tid,
        tx
      );

      await this.membershipAdminRepo.upsertMember(
        {
          userId: input.actorUserId,
          workspaceId: created.id,
          role: 'ADMIN',
        },
        input.tid,
        tx
      );

      for (const cls of baseOntologyClasses(created.id, input.actorAuthorHash)) {
        await this.ontologyRepo.saveClass(cls, input.tid, tx);
      }
      for (const relation of baseOntologyRelations(
        created.id,
        input.actorAuthorHash
      )) {
        await this.ontologyRepo.saveObjectProperty(relation, input.tid, tx);
      }

      await this.membershipAdminRepo.recordEvent(
        {
          workspaceId: created.id,
          userId: input.actorUserId,
          actorType: 'ADMIN',
          actorId: input.actorUserId,
          action: 'WORKSPACE_CREATED',
          afterRole: 'ADMIN',
          requestId: input.reqId ?? null,
        },
        input.tid,
        tx
      );

      return created;
    });

    const stats = await this.workspaceRepo.getStats(workspace.id, input.tid);
    return stats ?? { ...workspace, memberCount: 1, pendingRequestCount: 0 };
  }
}
