import { EditProposal } from '../../domain/entities/EditProposal.js';
import { DomainError } from '../../domain/errors/DomainError.js';
import { INodeRepository } from '../../domain/ports/INodeRepository.js';
import { IEdgeRepository } from '../../domain/ports/IEdgeRepository.js';
import { DbTransaction } from '../../domain/ports/Transaction.js';

/**
 * Repositories required to apply a merge (ADR-0026).
 */
export interface MergeRepositories {
  nodeRepo: INodeRepository;
  edgeRepo: IEdgeRepository;
}

/**
 * Apply a `MERGE` proposal (ADR-0026): the proposal's target (the duplicate)
 * is merged into the node named by `proposedChanges.mergeIntoNodeId` (the
 * survivor).
 *
 * The operation is a domain decision, not a SQL script:
 *
 *   - the duplicate becomes `MERGED` and points at the survivor;
 *   - the survivor adopts the attributes the duplicate has and it does not
 *     (the survivor's own values always win) and inherits its support;
 *   - the duplicate's edges are re-pointed to the survivor.
 *
 * It MUST run inside the caller's UnitOfWork `tx` so the graph change and
 * the proposal status change commit atomically.
 */
export async function applyMergeProposal(
  repos: MergeRepositories,
  proposal: EditProposal,
  workspaceId: string,
  tid: string,
  tx: DbTransaction
): Promise<void> {
  const survivorId = proposal.mergeTargetId;
  if (!survivorId) {
    throw new DomainError(
      'ERR_VALIDATION_FAILED',
      'a merge proposal must name the surviving node'
    );
  }

  // A node outside the workspace is indistinguishable from a missing one
  // (ADR-0008): both are `ERR_NODE_NOT_FOUND`.
  const duplicate = await repos.nodeRepo.findByIdInWorkspace(
    proposal.targetId,
    workspaceId,
    tid
  );
  if (!duplicate) {
    throw new DomainError('ERR_NODE_NOT_FOUND');
  }

  const survivor = await repos.nodeRepo.findByIdInWorkspace(
    survivorId,
    workspaceId,
    tid
  );
  if (!survivor) {
    throw new DomainError('ERR_NODE_NOT_FOUND');
  }

  // The state can have changed since the proposal was created: a node that
  // was merged away in the meantime cannot absorb another one, and the
  // duplicate may have been merged away too. Both would leave the graph
  // without a survivor (a merge cycle).
  if (!survivor.isMergeable) {
    throw new DomainError(
      'ERR_INVALID_STATE_TRANSITION',
      `a node in status ${survivor.status} cannot absorb another node`
    );
  }
  if (!duplicate.isMergeable) {
    throw new DomainError(
      'ERR_INVALID_STATE_TRANSITION',
      `a node in status ${duplicate.status} cannot be merged away`
    );
  }

  // The domain owns the transition and the rules; the adapter only persists
  // what the entities decided.
  duplicate.mergeInto(survivor.id);
  survivor.absorb(duplicate);

  await repos.nodeRepo.mergeInto(duplicate, survivor, tid, tx);
  await repos.edgeRepo.repointEdges(
    duplicate.id,
    survivor.id,
    workspaceId,
    tid,
    tx
  );
}
