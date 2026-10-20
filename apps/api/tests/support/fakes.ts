import type { Edge } from '../../src/domain/entities/Edge.js';
import type { Node } from '../../src/domain/entities/Node.js';
import type { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';
import type { DbTransaction } from '../../src/domain/ports/Transaction.js';
import type { IEdgeRepository } from '../../src/domain/ports/IEdgeRepository.js';
import type { IEventPublisher } from '../../src/domain/ports/IEventPublisher.js';
import type { INodeRepository } from '../../src/domain/ports/INodeRepository.js';
import type { NearestNeighborsResult } from '../../src/domain/ports/INodeRepository.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import type { IUnitOfWork } from '../../src/domain/ports/IUnitOfWork.js';

/**
 * Shared in-memory fakes for application-layer use-case tests.
 *
 * Fakes only: no DB, no Redis, no network. Repositories are plain object
 * literals implementing the port, so a port change breaks compilation of the
 * test on the next `tsc --noEmit` run rather than silently drifting.
 */

/** Non-`undefined` transaction handle so the use case's `tx` branch runs. */
export const TX_SENTINEL: DbTransaction = { testTx: true };

/** Records published event names in call order. */
export function makeEventPublisher(): { publisher: IEventPublisher; events: string[] } {
  const events: string[] = [];
  const publisher: IEventPublisher = {
    async publish(event) {
      events.push(event);
    },
  };
  return { publisher, events };
}

/** Runs the callback with `TX_SENTINEL` and counts invocations. */
export function makeUnitOfWork(): { uow: IUnitOfWork; ran: { count: number } } {
  const ran = { count: 0 };
  const uow: IUnitOfWork = {
    async runInTransaction(_tid, work) {
      ran.count += 1;
      return work(TX_SENTINEL);
    },
  };
  return { uow, ran };
}

export interface EmbeddingWrite {
  id: string;
  workspaceId: string;
  embedding: number[];
  model: string;
}

/** Records every write the fake performed, for assertions. */
export interface FakeNodeRepository {
  repo: INodeRepository;
  softDeleted: string[];
  appliedDeltas: Array<{ targetId: string; workspaceId: string; tx: DbTransaction | undefined }>;
  embeddings: EmbeddingWrite[];
  merges: Array<{ sourceId: string; targetId: string; tx: DbTransaction | undefined }>;
  nearestCalls: Array<{
    sourceId: string;
    workspaceId: string;
    limit: number;
  }>;
}

/**
 * In-memory `INodeRepository` backed by the supplied nodes.
 *
 * `nearest` is the canned answer of the vector search (ADR-0022); it defaults
 * to `NOT_FOUND` so a test that does not care never sees a neighbour.
 */
export function makeNodeRepository(
  nodes: Node[] = [],
  nearest: NearestNeighborsResult = { status: 'NOT_FOUND' }
): FakeNodeRepository {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const softDeleted: string[] = [];
  const appliedDeltas: FakeNodeRepository['appliedDeltas'] = [];
  const embeddings: EmbeddingWrite[] = [];
  const merges: FakeNodeRepository['merges'] = [];
  const nearestCalls: FakeNodeRepository['nearestCalls'] = [];
  const repo: INodeRepository = {
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByIdInWorkspace(id, workspaceId) {
      const node = byId.get(id);
      return node && node.workspaceId === workspaceId ? node : null;
    },
    async listByWorkspace() {
      return { items: [], nextCursor: null };
    },
    async getSubgraph() {
      return { nodes: [], edges: [] };
    },
    async save() {},
    async update() {},
    async softDelete(id) {
      softDeleted.push(id);
    },
    async applyDelta(targetId, _changes, workspaceId, _tid, tx) {
      appliedDeltas.push({ targetId, workspaceId, tx });
    },
    // ADR-0026: the domain already mutated the entities; the fake only
    // records that the merge reached the adapter.
    async mergeInto(source, target, _tid, tx) {
      merges.push({ sourceId: source.id, targetId: target.id, tx });
    },
    // Mirrors the adapter: a missing node, a foreign workspace or a
    // soft-deleted row is never updated.
    async setEmbedding(id, workspaceId, embedding, model) {
      const node = byId.get(id);
      if (!node || node.workspaceId !== workspaceId) return false;
      embeddings.push({ id, workspaceId, embedding, model });
      return true;
    },
    async findNearestInWorkspace(sourceId, workspaceId, opts) {
      nearestCalls.push({ sourceId, workspaceId, limit: opts.limit });
      return nearest;
    },
  };
  return { repo, softDeleted, appliedDeltas, embeddings, merges, nearestCalls };
}

export interface FakeEdgeRepository {
  repo: IEdgeRepository;
  saved: Edge[];
  appliedDeltas: Array<{ targetId: string; workspaceId: string; tx: DbTransaction | undefined }>;
  repointed: Array<{
    nodeId: string;
    replacementId: string;
    workspaceId: string;
    tx: DbTransaction | undefined;
  }>;
}

/** In-memory `IEdgeRepository` recording saves and applied deltas. */
export function makeEdgeRepository(): FakeEdgeRepository {
  const saved: Edge[] = [];
  const appliedDeltas: FakeEdgeRepository['appliedDeltas'] = [];
  const repointed: FakeEdgeRepository['repointed'] = [];
  const repo: IEdgeRepository = {
    async findById() {
      return null;
    },
    async findByIdInWorkspace() {
      return null;
    },
    async listAllByWorkspace() {
      return [];
    },
    async listByWorkspace() {
      return { items: [], nextCursor: null };
    },
    async save(edge) {
      saved.push(edge);
    },
    async update() {},
    async softDelete() {},
    async applyDelta(targetId, _changes, workspaceId, _tid, tx) {
      appliedDeltas.push({ targetId, workspaceId, tx });
    },
    // ADR-0026: the merge re-points the edges of the merged node.
    async repointEdges(nodeId, replacementId, workspaceId, _tid, tx) {
      repointed.push({ nodeId, replacementId, workspaceId, tx });
    },
  };
  return { repo, saved, appliedDeltas, repointed };
}

export interface FakeOntologyRepository {
  repo: IOntologyRepository;
  activated: string[];
  deltasApplied: string[];
}

/** In-memory `IOntologyRepository`; only `findObjectProperty` is behaviourful. */
export function makeOntologyRepository(
  objectProperty: ObjectProperty | null = null
): FakeOntologyRepository {
  const activated: string[] = [];
  const deltasApplied: string[] = [];
  const repo: IOntologyRepository = {
    async findClassById() {
      return null;
    },
    async findClassByKey() {
      return null;
    },
    async findActiveClasses() {
      return [];
    },
    async findDatatypeProperties() {
      return [];
    },
    async findObjectProperty() {
      return objectProperty;
    },
    async findActiveObjectProperties() {
      return [];
    },
    async saveClass() {},
    async saveDatatypeProperty() {},
    async saveObjectProperty() {},
    async applyClassDelta(targetId) {
      deltasApplied.push(targetId);
    },
    async activateClass(targetId) {
      activated.push(targetId);
    },
  };
  return { repo, activated, deltasApplied };
}
