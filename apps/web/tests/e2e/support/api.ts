/**
 * A thin client over the API.
 *
 * The suite drives the **app** through the browser; the API is used for the
 * two things the browser cannot do:
 *
 * - prepare what a journey needs (the PWA has no screen to open a proposal);
 * - read back what the app did, so the assertion is about the **data** and
 *   not about what the app believes.
 *
 * The types are declared here instead of imported from
 * `@vozlab/shared-types`: the package ships raw TypeScript with NodeNext
 * `./x.js` specifiers, which the Playwright loader does not rewrite. The
 * shapes below are the ones of the API reference (`docs/api-reference.md`).
 */

import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from './config';

/** The projection of a node (`GET /api/v1/nodes/:id`). */
export interface NodeDto {
  id: string;
  workspaceId: string;
  typeKey: string;
  title: string;
  description: string | null;
  attributes: Record<string, unknown>;
  authorHash: string;
  status: string;
  communityScore: number;
  createdAt: string;
  updatedAt: string;
}

/** The answer of a node creation (`POST /api/v1/nodes`). */
export interface CreatedNodeDto {
  id: string;
  workspaceId: string;
  typeKey: string;
  title: string;
  description: string | null;
  status: string;
}

/** The projection of a relation (`GET /api/v1/edges`). */
export interface EdgeDto {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationKey: string;
  attributes: Record<string, unknown>;
  authorHash: string;
  status: string;
  communityScore: number;
  createdAt: string;
}

/** The projection of a proposal (`GET /api/v1/proposals`). */
export interface ProposalDto {
  id: string;
  workspaceId: string;
  targetId: string;
  targetType: string;
  kind: string;
  status: string;
  communityScore: number;
  justification: string | null;
  proposerHash: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  proposedChanges: Record<string, unknown>;
  createdAt: string;
}

/** The projection of a discussion thread (`GET /api/v1/discussions`). */
export interface ThreadDto {
  id: string;
  workspaceId: string;
  targetId: string;
  targetType: string;
  title: string;
  status: string;
  createdByHash: string;
  createdAt: string;
  updatedAt: string;
}

/** The projection of a comment (`GET /api/v1/discussions/:threadId/posts`). */
export interface PostDto {
  id: string;
  threadId: string;
  parentPostId: string | null;
  authorHash: string;
  body: string;
  upvotes: number;
  downvotes: number;
  communityScore: number;
  createdAt: string;
}

/** The membership of a workspace (`GET /api/v1/auth/me`). */
export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
}

/** The envelope of a failed call. */
export interface ApiErrorEnvelope {
  code: string;
  message: string;
}

/** The options of the client. */
export interface ApiClientOptions {
  /** The request context the calls are made with. */
  readonly request: APIRequestContext;
  /** The access token of the session. */
  readonly accessToken: string;
  /** The workspace every call is scoped to. */
  readonly workspaceId: string;
  /**
   * The unique marker of the test.
   *
   * Every object the test creates carries it in its title (or in its
   * justification), so the clean-up can find the objects of the test and only
   * those.
   */
  readonly marker: string;
}

/** A call that failed. */
export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: ApiErrorEnvelope | null,
    readonly path: string
  ) {
    super(
      `${path} answered ${status}: ${envelope === null ? '(no envelope)' : `${envelope.code} — ${envelope.message}`}`
    );
    this.name = 'ApiCallError';
  }
}

export class ApiClient {
  readonly marker: string;

  readonly #request: APIRequestContext;
  readonly #accessToken: string;
  readonly #workspaceId: string;

  /** The relations the test created — they are deleted by the clean-up. */
  readonly #edgeIds: string[] = [];

  constructor(options: ApiClientOptions) {
    this.#request = options.request;
    this.#accessToken = options.accessToken;
    this.#workspaceId = options.workspaceId;
    this.marker = options.marker;
  }

  /** The workspace every call is scoped to. */
  get workspaceId(): string {
    return this.#workspaceId;
  }

  /** Performs a call and parses the answer. */
  async call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const hasBody = body !== undefined;
    const response = await this.#request.fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.#accessToken}`,
        'X-Workspace-ID': this.#workspaceId,
        'x-correlation-id': correlationId(),
        ...(hasBody ? { 'Content-Type': 'application/json' } : {})
      },
      data: hasBody ? JSON.stringify(body) : undefined
    });

    if (!response.ok()) {
      throw new ApiCallError(response.status(), await readEnvelope(response), path);
    }

    const text = await response.text();
    if (text.trim() === '') {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  /** The memberships of the signed-in user. */
  async me(): Promise<{ workspaces: WorkspaceSummary[] }> {
    return this.call('GET', '/auth/me');
  }

  /** Creates a node and remembers it for the clean-up. */
  async createNode(input: {
    typeKey: string;
    title: string;
    description?: string;
    attributes?: Record<string, unknown>;
  }): Promise<CreatedNodeDto> {
    return this.call<CreatedNodeDto>('POST', '/nodes', {
      typeKey: input.typeKey,
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      attributes: input.attributes ?? {}
    });
  }

  /** Reads one node back. */
  async getNode(nodeId: string): Promise<NodeDto> {
    const body = await this.call<{ node: NodeDto }>('GET', `/nodes/${nodeId}`);
    return body.node;
  }

  /** Reads one relation back — with its attributes. */
  async getEdge(edgeId: string): Promise<EdgeDto> {
    const body = await this.call<{ edge: EdgeDto }>('GET', `/edges/${edgeId}`);
    return body.edge;
  }

  /** Lists the nodes of the workspace (the newest first). */
  async listNodes(): Promise<NodeDto[]> {
    const body = await this.call<{ nodes: NodeDto[] }>('GET', '/nodes?limit=100');
    return body.nodes;
  }

  /** Soft-deletes a node — the author only. */
  async deleteNode(nodeId: string): Promise<void> {
    await this.call('DELETE', `/nodes/${nodeId}`);
  }

  /** Creates a relation and remembers it for the clean-up. */
  async createEdge(input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationKey: string;
    attributes?: Record<string, unknown>;
  }): Promise<EdgeDto> {
    const created = await this.call<EdgeDto>('POST', '/edges', {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationKey: input.relationKey,
      attributes: input.attributes ?? {}
    });
    this.#edgeIds.push(created.id);
    return created;
  }

  /** Soft-deletes a relation — the author only. */
  async deleteEdge(edgeId: string): Promise<void> {
    await this.call('DELETE', `/edges/${edgeId}`);
  }

  /** Opens a proposal on a target. */
  async createProposal(input: {
    targetId: string;
    targetType: 'NODE' | 'EDGE' | 'ONTOLOGY';
    proposedChanges: Record<string, unknown>;
    justification?: string;
  }): Promise<ProposalDto> {
    return this.call<ProposalDto>('POST', '/proposals', {
      targetId: input.targetId,
      targetType: input.targetType,
      proposedChanges: input.proposedChanges,
      ...(input.justification === undefined ? {} : { justification: input.justification })
    });
  }

  /** Lists the proposals of the workspace (the newest first). */
  async listProposals(): Promise<ProposalDto[]> {
    const body = await this.call<{ proposals: ProposalDto[] }>('GET', '/proposals?limit=100');
    return body.proposals;
  }

  /** Rejects a proposal — the maintainer of the target only. */
  async rejectProposal(proposalId: string): Promise<void> {
    await this.call('PUT', `/proposals/${proposalId}/reject`);
  }

  /** Lists the threads of a target. */
  async listThreads(targetId: string, targetType: 'NODE' | 'EDGE' | 'PROPOSAL' | 'ONTOLOGY'): Promise<ThreadDto[]> {
    const body = await this.call<{ threads: ThreadDto[] }>(
      'GET',
      `/discussions?targetId=${targetId}&targetType=${targetType}&limit=100`
    );
    return body.threads;
  }

  /** Closes a thread — the creator only. */
  async closeThread(threadId: string): Promise<void> {
    await this.call('PUT', `/discussions/${threadId}/close`);
  }

  /** Lists the comments of a thread. */
  async listPosts(threadId: string): Promise<PostDto[]> {
    const body = await this.call<{ posts: PostDto[] }>(
      'GET',
      `/discussions/${threadId}/posts?limit=100`
    );
    return body.posts;
  }

  /** Soft-deletes a comment — the author only. */
  async deletePost(postId: string): Promise<void> {
    await this.call('DELETE', `/discussions/posts/${postId}`);
  }

  /**
   * Removes what the test created, as far as the API allows.
   *
   * The API offers a **soft** delete for the nodes, the relations and the
   * comments (the author only) and a close for the threads (the creator
   * only). The rows stay in the table with their `deleted_at`; the proposals
   * are rejected so that no pending proposal is left behind.
   *
   * The order matters: a proposal is resolved against its target and a
   * relation is read with its endpoints, so the nodes are deleted **last**.
   *
   * Every step is best effort: a clean-up that fails must not fail the test
   * that passed.
   */
  async cleanup(authorHash: string): Promise<void> {
    // The nodes of the test.
    const nodes = (await this.listNodes()).filter(
      (node) => node.authorHash === authorHash && node.title.includes(this.marker)
    );
    const nodeIds = nodes.map((node) => node.id);

    // The proposals of the test — while their target still exists. A
    // proposal may target a node **or** a relation.
    const targetIds = [...nodeIds, ...this.#edgeIds];

    for (const proposal of await this.listProposals()) {
      if (proposal.proposerHash !== authorHash || !targetIds.includes(proposal.targetId)) {
        continue;
      }
      await this.soft(() => this.rejectProposal(proposal.id));
    }

    // The comments and the threads of the test.
    for (const nodeId of nodeIds) {
      for (const thread of await this.listThreads(nodeId, 'NODE')) {
        if (thread.createdByHash !== authorHash) {
          continue;
        }
        for (const post of await this.listPosts(thread.id)) {
          if (post.authorHash !== authorHash) {
            continue;
          }
          await this.soft(() => this.deletePost(post.id));
        }
        await this.soft(() => this.closeThread(thread.id));
      }
    }

    // The relations of the test.
    for (const edgeId of this.#edgeIds) {
      await this.soft(() => this.deleteEdge(edgeId));
    }

    // The nodes of the test — last.
    for (const node of nodes) {
      await this.soft(() => this.deleteNode(node.id));
    }
  }

  /** Runs a clean-up step and swallows its failure. */
  private async soft(step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (error) {
      // The clean-up is best effort: the rows that could not be removed are
      // reported in the run report, not in the test. `E2E_DEBUG=1` shows
      // them while the suite runs.
      if (process.env['E2E_DEBUG'] === '1') {
        console.error('[e2e] the clean-up could not remove something:', error);
      }
    }
  }
}

/** Reads the error envelope of a failed answer. */
async function readEnvelope(response: { json: () => Promise<unknown> }): Promise<ApiErrorEnvelope | null> {
  try {
    const body = await response.json();
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const envelope = body as Record<string, unknown>;
    if (typeof envelope['code'] !== 'string' || typeof envelope['message'] !== 'string') {
      return null;
    }
    return { code: envelope['code'], message: envelope['message'] };
  } catch {
    return null;
  }
}

/** A correlation id, like the one the app sends. */
function correlationId(): string {
  return globalThis.crypto.randomUUID();
}
