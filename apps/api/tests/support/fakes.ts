import type { Edge } from '../../src/domain/entities/Edge.js';
import type { Node } from '../../src/domain/entities/Node.js';
import type { DatatypeProperty } from '../../src/domain/entities/DatatypeProperty.js';
import type { ObjectProperty } from '../../src/domain/entities/ObjectProperty.js';
import type { OntologyClass } from '../../src/domain/entities/OntologyClass.js';
import type { DbTransaction } from '../../src/domain/ports/Transaction.js';
import type { IEdgeRepository } from '../../src/domain/ports/IEdgeRepository.js';
import type { IEventPublisher } from '../../src/domain/ports/IEventPublisher.js';
import type { INodeRepository } from '../../src/domain/ports/INodeRepository.js';
import type { NearestNeighborsResult, SubgraphEdge } from '../../src/domain/ports/INodeRepository.js';
import type { IOntologyRepository } from '../../src/domain/ports/IOntologyRepository.js';
import type { IUnitOfWork } from '../../src/domain/ports/IUnitOfWork.js';
import { DisplayNameCatalog } from '../../src/application/use_cases/DisplayNameCatalog.js';

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
  windowCalls: Array<{ workspaceId: string; limit: number; tid: string }>;
}

/**
 * In-memory `INodeRepository` backed by the supplied nodes.
 *
 * `nearest` is the canned answer of the vector search (ADR-0022); it defaults
 * to `NOT_FOUND` so a test that does not care never sees a neighbour.
 *
 * `edges` are the relations of the fake workspace; the window returns only
 * the ones whose both endpoints are inside the window, exactly as the
 * adapter does (the window is a closed graph).
 */
export function makeNodeRepository(
  nodes: Node[] = [],
  nearest: NearestNeighborsResult = { status: 'NOT_FOUND' },
  edges: SubgraphEdge[] = []
): FakeNodeRepository {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const softDeleted: string[] = [];
  const appliedDeltas: FakeNodeRepository['appliedDeltas'] = [];
  const embeddings: EmbeddingWrite[] = [];
  const merges: FakeNodeRepository['merges'] = [];
  const nearestCalls: FakeNodeRepository['nearestCalls'] = [];
  const windowCalls: FakeNodeRepository['windowCalls'] = [];
  const repo: INodeRepository = {
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByIdInWorkspace(id, workspaceId) {
      const node = byId.get(id);
      return node && node.workspaceId === workspaceId ? node : null;
    },
    async listByWorkspace(workspaceId, opts) {
      const items = nodes
        .filter((node) => node.workspaceId === workspaceId)
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
        )
        .slice(0, opts.limit);

      return { items, nextCursor: null };
    },
    async getSubgraph(rootId, workspaceId, opts) {
      const root = byId.get(rootId);

      if (!root || root.workspaceId !== workspaceId) {
        return { nodes: [], edges: [] };
      }

      // The ranking rule (roadmap 3.20): "the nearest" is the strongest
      // relation first, and among equals the most recent. The fake models
      // the adapter: the neighbours of a node are the relations that touch
      // it, ranked by `communityScore DESC` and then by `createdAt DESC`,
      // and the walk is bounded by the depth and the limit.
      const limit = Math.max(1, Math.trunc(opts.limit));
      const depth = Math.max(0, Math.trunc(opts.depth));

      const relationsOf = new Map<string, SubgraphEdge[]>();
      for (const edge of edges) {
        for (const endpoint of [edge.sourceNodeId, edge.targetNodeId]) {
          const list = relationsOf.get(endpoint) ?? [];
          list.push(edge);
          relationsOf.set(endpoint, list);
        }
      }

      const byRank = (a: SubgraphEdge, b: SubgraphEdge) =>
        b.communityScore - a.communityScore ||
        b.createdAt.getTime() - a.createdAt.getTime();

      const seen = new Set<string>([rootId]);
      const depthById = new Map<string, number>([[rootId, 0]]);
      // The score and the instant of the relation that reached a node: the
      // strength the traversal carries along.
      const scoreById = new Map<string, number>([[rootId, 0]]);
      const reachedAtById = new Map<string, number>([[rootId, 0]]);
      const covered: Node[] = [root];
      let frontier: Node[] = [root];

      for (let level = 1; level <= depth; level++) {
        const next: Node[] = [];

        for (const node of frontier) {
          const relations = (relationsOf.get(node.id) ?? []).slice().sort(byRank);

          for (const relation of relations.slice(0, limit)) {
            const neighbourId =
              relation.sourceNodeId === node.id ? relation.targetNodeId : relation.sourceNodeId;

            if (seen.has(neighbourId)) continue;

            const neighbour = byId.get(neighbourId);
            if (!neighbour || neighbour.workspaceId !== workspaceId) continue;

            seen.add(neighbourId);
            depthById.set(neighbourId, level);
            scoreById.set(neighbourId, relation.communityScore);
            reachedAtById.set(neighbourId, relation.createdAt.getTime());
            next.push(neighbour);

            if (covered.length + next.length >= limit) break;
          }

          if (covered.length + next.length >= limit) break;
        }

        covered.push(...next);
        frontier = next;

        if (covered.length >= limit) break;
      }

      const inCovered = new Set(covered.map((node) => node.id));
      const coveredEdges = edges
        .filter(
          (edge) => inCovered.has(edge.sourceNodeId) && inCovered.has(edge.targetNodeId)
        )
        .sort(byRank);

      covered.sort(
        (a, b) =>
          (depthById.get(a.id) ?? 0) - (depthById.get(b.id) ?? 0) ||
          (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) ||
          (reachedAtById.get(b.id) ?? 0) - (reachedAtById.get(a.id) ?? 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );

      return {
        nodes: covered,
        edges: coveredEdges,
      };
    },
    // The exploration window: the newest nodes of the workspace and the
    // relations among them (both endpoints inside the window).
    async getWindowInWorkspace(workspaceId, opts, tid) {
      windowCalls.push({ workspaceId, limit: opts.limit, tid });
      const windowed = nodes
        .filter((node) => node.workspaceId === workspaceId)
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
        )
        .slice(0, opts.limit);
      const inWindow = new Set(windowed.map((node) => node.id));
      return {
        nodes: windowed,
        // The ranking rule, applied consistently: the strongest relations
        // first, and among equals the most recent.
        edges: edges
          .filter(
            (edge) => inWindow.has(edge.sourceNodeId) && inWindow.has(edge.targetNodeId)
          )
          .sort(
            (a, b) =>
              b.communityScore - a.communityScore ||
              b.createdAt.getTime() - a.createdAt.getTime()
          ),
      };
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
  return { repo, softDeleted, appliedDeltas, embeddings, merges, nearestCalls, windowCalls };
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
  const byId = new Map<string, Edge>();
  const repo: IEdgeRepository = {
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async findByIdInWorkspace(id, workspaceId) {
      const edge = byId.get(id);
      return edge && edge.workspaceId === workspaceId ? edge : null;
    },
    async listAllByWorkspace(workspaceId) {
      return saved.filter((edge) => edge.workspaceId === workspaceId);
    },
    async listByWorkspace(workspaceId) {
      return {
        items: saved.filter((edge) => edge.workspaceId === workspaceId),
        nextCursor: null,
      };
    },
    async save(edge) {
      saved.push(edge);
      byId.set(edge.id, edge);
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
  /**
   * The reads of the active metamodel.
   *
   * The counters are the proof that the names of the ontology are read
   * **once** per answer: a window of two hundred nodes reads the classes
   * once and the properties once.
   */
  reads: {
    classes: number;
    properties: number;
    /** The workspace of every read — the scoping is visible. */
    workspaces: string[];
  };
}

/**
 * In-memory `IOntologyRepository`; the metamodel reads are behaviourful.
 *
 * `findActiveClasses` and `findActiveObjectProperties` mirror the adapter:
 * only the ACTIVE rows of the **request workspace** are visible — a class
 * of another workspace never leaks, and a proposal stays hidden.
 */
export function makeOntologyRepository(
  objectProperty: ObjectProperty | null = null,
  datatypeProperties: DatatypeProperty[] = [],
  classes: OntologyClass[] = [],
  objectProperties: ObjectProperty[] = []
): FakeOntologyRepository {
  const activated: string[] = [];
  const deltasApplied: string[] = [];
  const reads = { classes: 0, properties: 0, workspaces: [] as string[] };
  const repo: IOntologyRepository = {
    async findClassById() {
      return null;
    },
    async findClassByKey() {
      return null;
    },
    async findActiveClasses(workspaceId) {
      reads.classes += 1;
      reads.workspaces.push(workspaceId);
      return classes.filter(
        (cls) => cls.status === 'ACTIVE' && cls.workspaceId === workspaceId
      );
    },
    async findDatatypeProperties() {
      return datatypeProperties;
    },
    async findActiveDatatypeProperties() {
      return datatypeProperties.filter((prop) => prop.status === 'ACTIVE');
    },
    async findObjectProperty() {
      return objectProperty;
    },
    async findActiveObjectProperties(workspaceId) {
      reads.properties += 1;
      reads.workspaces.push(workspaceId);
      return objectProperties.filter(
        (property) => property.status === 'ACTIVE' && property.workspaceId === workspaceId
      );
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
  return { repo, activated, deltasApplied, reads };
}

/**
 * The catalog of the display names, over the fake ontology.
 *
 * The tests wire it exactly as the composition root does.
 */
export function makeDisplayNameCatalog(
  ontology: FakeOntologyRepository
): DisplayNameCatalog {
  return new DisplayNameCatalog(ontology.repo);
}
