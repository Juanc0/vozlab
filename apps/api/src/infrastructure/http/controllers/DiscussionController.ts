import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateThreadSchema,
  CreatePostSchema,
  ListThreadsQuerySchema,
  ListPostsQuerySchema,
} from '@vozlab/shared-types';
import { CreateThreadUseCase } from '../../../application/use_cases/CreateThreadUseCase.js';
import { AddPostUseCase } from '../../../application/use_cases/AddPostUseCase.js';
import { ListThreadsUseCase } from '../../../application/use_cases/ListThreadsUseCase.js';
import { ListPostsUseCase } from '../../../application/use_cases/ListPostsUseCase.js';
import { CloseThreadUseCase } from '../../../application/use_cases/CloseThreadUseCase.js';
import { DeletePostUseCase } from '../../../application/use_cases/DeletePostUseCase.js';
import { DiscussionThread } from '../../../domain/entities/DiscussionThread.js';
import { DiscussionPost } from '../../../domain/entities/DiscussionPost.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * Stable JSON projection of a thread. Never leaks the raw entity internals
 * (e.g. the `AuthorHash` value object) — the hash is emitted as a string.
 */
interface ThreadDto {
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

interface PostDto {
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

function toThreadDto(thread: DiscussionThread): ThreadDto {
  return {
    id: thread.id,
    workspaceId: thread.workspaceId,
    targetId: thread.targetId,
    targetType: thread.targetType,
    title: thread.title,
    status: thread.status,
    createdByHash: thread.createdByHash.toString(),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function toPostDto(post: DiscussionPost): PostDto {
  return {
    id: post.id,
    threadId: post.threadId,
    parentPostId: post.parentPostId,
    authorHash: post.authorHash.toString(),
    body: post.body,
    upvotes: post.upvotes,
    downvotes: post.downvotes,
    communityScore: post.communityScore,
    createdAt: post.createdAt.toISOString(),
  };
}

/**
 * DiscussionController: HTTP adapter for governance discussions (RF-11, RF-16).
 */
export class DiscussionController {
  constructor(
    private readonly createThread: CreateThreadUseCase,
    private readonly addPost: AddPostUseCase,
    private readonly listThreads: ListThreadsUseCase,
    private readonly listPosts: ListPostsUseCase,
    private readonly closeThread: CloseThreadUseCase,
    private readonly deletePost: DeletePostUseCase
  ) {}

  /** POST /api/v1/discussions */
  async createThreadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const thread = await this.createThread.execute({
        ...parsed.data,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: thread.id,
        targetId: thread.targetId,
        targetType: thread.targetType,
        title: thread.title,
        status: thread.status,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'createThread failed');
    }
  }

  /**
   * GET /api/v1/discussions?targetId=&targetType=&limit=&cursor=
   * Cursor-paginated listing of a target's threads (NFR-04).
   */
  async listThreadsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ListThreadsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const { items, nextCursor } = await this.listThreads.execute({
        targetId: parsed.data.targetId,
        targetType: parsed.data.targetType,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });

      return reply.status(200).send({
        threads: items.map(toThreadDto),
        nextCursor,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listThreads failed');
    }
  }

  /** POST /api/v1/discussions/:threadId/posts */
  async addPostHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const threadId = (req.params as { threadId: string }).threadId;

    const parsed = CreatePostSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    try {
      const post = await this.addPost.execute({
        ...parsed.data,
        threadId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(201).send({
        id: post.id,
        threadId: post.threadId,
        parentPostId: post.parentPostId,
        communityScore: post.communityScore,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'addPost failed');
    }
  }

  /**
   * GET /api/v1/discussions/:threadId/posts?limit=&cursor=
   * Chronological, cursor-paginated listing of a thread's posts (NFR-04).
   * Unknown thread → 404 `ERR_THREAD_NOT_FOUND`.
   */
  async listPostsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ListPostsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const threadId = (req.params as { threadId: string }).threadId;

    try {
      const { items, nextCursor } = await this.listPosts.execute({
        threadId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      });

      return reply.status(200).send({
        posts: items.map(toPostDto),
        nextCursor,
      });
    } catch (error) {
      return this.handleError(req, reply, error, 'listPosts failed');
    }
  }

  /**
   * PUT /api/v1/discussions/:threadId/close
   * Closes a thread (domain state machine). Only the creator may close it;
   * a non-creator gets 403 `ERR_AUTHORIZATION_FAILED`.
   */
  async closeThreadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const threadId = (req.params as { threadId: string }).threadId;

    try {
      const thread = await this.closeThread.execute({
        threadId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });

      return reply.status(200).send({ thread: toThreadDto(thread) });
    } catch (error) {
      return this.handleError(req, reply, error, 'closeThread failed');
    }
  }

  /**
   * DELETE /api/v1/discussions/posts/:id
   * Soft-deletes a post (204). Only the author may delete; a non-author gets
   * 403 `ERR_AUTHORIZATION_FAILED`; a missing/foreign/already-deleted post
   * yields 404 `ERR_POST_NOT_FOUND`.
   */
  async deletePostHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_INVALID_TOKEN');

    const postId = (req.params as { id: string }).id;

    try {
      await this.deletePost.execute({
        postId,
        workspaceId: ctx.workspaceId,
        tid: ctx.tid,
        authorHash: ctx.authorHash,
        reqId: ctx.reqId,
      });
      return reply.status(204).send();
    } catch (error) {
      return this.handleError(req, reply, error, 'deletePost failed');
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
