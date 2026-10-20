/**
 * The discussions of the governance flow (FR-11, FR-16).
 *
 * A discussion is always about something: `GET /api/v1/discussions` requires
 * both `targetId` and `targetType` (`ListThreadsQuerySchema`), so the client
 * can never ask for "the discussions" in general — it must name the node,
 * the edge, the proposal or the ontology class the threads are about.
 *
 * The threads are ordered `createdAt DESC, id DESC` and the posts are
 * chronological (`ASC`); both are paged with the opaque keyset cursor.
 */

import { cursorQuery, type ApiClient, type CursorPage, type QueryValue } from './client';
import type {
  CreatePostInput,
  CreateThreadInput,
  DiscussionTargetType,
  PostDto,
  ThreadDto,
  ThreadStatus
} from './types';

/** The largest page the API accepts (`ListThreadsQuerySchema` caps `limit` at 100). */
export const DISCUSSION_MAX_LIMIT = 100;

/** The default page of threads. */
export const DISCUSSION_DEFAULT_LIMIT = 20;

/** The default page of posts. */
export const POSTS_DEFAULT_LIMIT = 50;

/** Clamps a page size to the window the API accepts. */
export function clampDiscussionLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit)) {
    return fallback;
  }
  return Math.min(DISCUSSION_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/**
 * Builds the query of `GET /api/v1/discussions`.
 *
 * `targetId` and `targetType` are **required** by the API: they are always
 * sent, never dropped.
 */
export function buildThreadQuery(
  targetId: string,
  targetType: DiscussionTargetType,
  limit: number = DISCUSSION_DEFAULT_LIMIT,
  cursor: string | null = null
): Record<string, QueryValue> {
  return {
    targetId,
    targetType,
    ...cursorQuery(clampDiscussionLimit(limit, DISCUSSION_DEFAULT_LIMIT), cursor)
  };
}

/** Reads one page of the threads of a target. */
export async function listThreads(
  client: ApiClient,
  options: {
    readonly targetId: string;
    readonly targetType: DiscussionTargetType;
    readonly limit?: number;
    readonly cursor?: string | null;
  }
): Promise<CursorPage<ThreadDto>> {
  return client.page<ThreadDto>({
    path: '/discussions',
    resourceKey: 'threads',
    query: buildThreadQuery(
      options.targetId,
      options.targetType,
      options.limit ?? DISCUSSION_DEFAULT_LIMIT,
      options.cursor ?? null
    )
  });
}

/**
 * The answer of `POST /api/v1/discussions`.
 *
 * A projection of the new thread — not the whole {@link ThreadDto}: the
 * creator pseudonym and the timestamps are not in it.
 */
export interface CreatedThread {
  readonly id: string;
  readonly targetId: string;
  readonly targetType: DiscussionTargetType;
  readonly title: string;
  readonly status: ThreadStatus;
}

/** Opens a thread about a target (FR-11). */
export async function createThread(
  client: ApiClient,
  input: CreateThreadInput
): Promise<CreatedThread> {
  const body = await client.request<CreatedThread>({
    method: 'POST',
    path: '/discussions',
    body: {
      targetId: input.targetId,
      targetType: input.targetType,
      title: input.title
    }
  });

  return {
    id: body.id,
    targetId: body.targetId,
    targetType: body.targetType,
    title: body.title,
    status: body.status
  };
}

/** Reads one page of the posts of a thread — chronological (`ASC`). */
export async function listPosts(
  client: ApiClient,
  options: {
    readonly threadId: string;
    readonly limit?: number;
    readonly cursor?: string | null;
  }
): Promise<CursorPage<PostDto>> {
  return client.page<PostDto>({
    path: `/discussions/${encodeURIComponent(options.threadId)}/posts`,
    resourceKey: 'posts',
    query: cursorQuery(
      clampDiscussionLimit(options.limit ?? POSTS_DEFAULT_LIMIT, POSTS_DEFAULT_LIMIT),
      options.cursor ?? null
    )
  });
}

/**
 * The answer of `POST /api/v1/discussions/:threadId/posts`.
 *
 * A projection of the new post: the body and the author are not in it, so
 * the thread is read again to show the post in place.
 */
export interface CreatedPost {
  readonly id: string;
  readonly threadId: string;
  readonly parentPostId: string | null;
  readonly communityScore: number;
}

/** Adds a post to a thread — a reply carries the id of its parent. */
export async function addPost(
  client: ApiClient,
  threadId: string,
  input: CreatePostInput
): Promise<CreatedPost> {
  const body = await client.request<CreatedPost>({
    method: 'POST',
    path: `/discussions/${encodeURIComponent(threadId)}/posts`,
    body: {
      body: input.body,
      ...(input.parentPostId ? { parentPostId: input.parentPostId } : {})
    }
  });

  return {
    id: body.id,
    threadId: body.threadId,
    parentPostId: body.parentPostId ?? null,
    communityScore: body.communityScore
  };
}

/**
 * Closes a thread.
 *
 * **Only the creator may close it**; the API answers `403
 * ERR_AUTHORIZATION_FAILED` otherwise, and `422 ERR_INVALID_STATE_TRANSITION`
 * when the thread is already closed. The answer is the whole thread, so the
 * list can be updated without a second read.
 */
export async function closeThread(client: ApiClient, threadId: string): Promise<ThreadDto> {
  const body = await client.request<{ thread: ThreadDto }>({
    method: 'PUT',
    path: `/discussions/${encodeURIComponent(threadId)}/close`
  });

  return body.thread;
}

/**
 * Deletes a post (soft delete).
 *
 * **Only the author may delete it**; the API answers `403
 * ERR_AUTHORIZATION_FAILED` otherwise and `404 ERR_POST_NOT_FOUND` when the
 * post is missing, foreign or already deleted.
 */
export async function deletePost(client: ApiClient, postId: string): Promise<void> {
  await client.requestVoid({
    method: 'DELETE',
    path: `/discussions/posts/${encodeURIComponent(postId)}`
  });
}
