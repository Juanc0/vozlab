import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateThreadSchema, CreatePostSchema } from '@vozlab/shared-types';
import { CreateThreadUseCase } from '../../../application/use_cases/CreateThreadUseCase.js';
import { AddPostUseCase } from '../../../application/use_cases/AddPostUseCase.js';
import { log } from '../../../shared/logger/index.js';
import { getRequestContext } from './requestContext.js';
import { sendError, mapDomainError } from './errorResponse.js';

/**
 * DiscussionController: HTTP adapter for governance discussions (RF-11, RF-16).
 */
export class DiscussionController {
  constructor(
    private readonly createThread: CreateThreadUseCase,
    private readonly addPost: AddPostUseCase
  ) {}

  /** POST /api/v1/discussions */
  async createThreadHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = CreateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(reply, 'ERR_VALIDATION_FAILED', { issues: parsed.error.issues });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'createThread failed'
      );
      return sendError(reply, mapDomainError(error));
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
    if (!ctx) return sendError(reply, 'ERR_MISSING_WORKSPACE_HEADER');

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
      log.error(
        { err: error instanceof Error ? error.message : error, reqId: ctx.reqId },
        'addPost failed'
      );
      return sendError(reply, mapDomainError(error));
    }
  }
}
