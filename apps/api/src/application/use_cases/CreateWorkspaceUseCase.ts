import { DomainError } from '../../domain/errors/DomainError.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { IUserRepository } from '../../domain/ports/IUserRepository.js';
import { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';
import {
  IWorkspaceRepository,
  WorkspaceWithStats,
} from '../../domain/ports/IWorkspaceRepository.js';
import { IMembershipAdminRepository } from '../../domain/ports/IMembershipAdminRepository.js';
import { IWorkspaceJoinCodeRepository } from '../../domain/ports/IWorkspaceJoinCodeRepository.js';
import { assertTenantAdmin } from '../policies/workspaceAdminPolicy.js';
import {
  baseOntologyClasses,
  baseOntologyRelations,
} from './BaseOntology.js';
import { generateJoinCodeSecret } from './joinCodeSecret.js';

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

/**
 * The creation answer: the workspace with its stats plus the raw value of
 * the default join code. The raw code is revealed **once** here and never
 * read back — only its hash is stored (DEC-5 D3, ADR-0045).
 */
export interface CreateWorkspaceResult {
  workspace: WorkspaceWithStats;
  joinCode: string;
}

/**
 * Use Case: create a workspace in the caller's tenant (US-00).
 *
 * One transaction provisions the row, its default join code, the base
 * ontology and the creator's ADMIN membership: a workspace can never exist
 * without an administrator, without the metamodel that makes it usable, or
 * without the single credential (ADR-0045) that lets others ask to enter.
 */
export class CreateWorkspaceUseCase {
  constructor(
    private readonly workspaceRepo: IWorkspaceRepository,
    private readonly membershipAdminRepo: IMembershipAdminRepository,
    private readonly ontologyRepo: IOntologyRepository,
    private readonly userRepo: IUserRepository,
    private readonly uow: IUnitOfWork,
    private readonly joinCodeRepo: IWorkspaceJoinCodeRepository
  ) {}

  async execute(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
    const actor = await this.userRepo.findById(input.actorUserId, input.tid);
    if (!actor || actor.provider === 'ANONYMOUS_EVENT') {
      throw new DomainError('ERR_AUTHORIZATION_FAILED');
    }
    await assertTenantAdmin(input.actorUserId, input.tid, this.userRepo);

    const existing = await this.workspaceRepo.findBySlug(input.slug, input.tid);
    if (existing) {
      throw new DomainError('ERR_WORKSPACE_SLUG_TAKEN');
    }

    const secret = generateJoinCodeSecret();

    const workspace = await this.uow.runInTransaction(input.tid, async (tx) => {
      const created = await this.workspaceRepo.create(
        {
          slug: input.slug,
          name: input.name,
          description: input.description,
          isPublic: input.isPublic,
          kind: input.kind ?? 'PRIVATE',
        },
        input.tid,
        tx
      );

      await this.joinCodeRepo.create(
        {
          workspaceId: created.id,
          codeHash: secret.codeHash,
          label: 'default',
          autoApprove: false,
          createdByHash: input.actorAuthorHash,
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
    return {
      workspace: stats ?? { ...workspace, memberCount: 1, pendingRequestCount: 0 },
      joinCode: secret.raw,
    };
  }
}
