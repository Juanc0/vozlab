import { describe, expect, it } from 'vitest';
import { CloseThreadUseCase } from '../../src/application/use_cases/CloseThreadUseCase.js';
import { DiscussionThread } from '../../src/domain/entities/DiscussionThread.js';
import { DiscussionPost } from '../../src/domain/entities/DiscussionPost.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { IDiscussionRepository } from '../../src/domain/ports/IDiscussionRepository.js';
import type { IEventPublisher } from '../../src/domain/ports/IEventPublisher.js';

const authorHash = AuthorHash.fromIdentity('author-1', 'salt');

function makeThread(overrides: Partial<{
  id: string;
  workspaceId: string;
  createdByHash: AuthorHash;
}> = {}): DiscussionThread {
  return new DiscussionThread(
    overrides.id ?? 'thread-1',
    overrides.workspaceId ?? 'ws-1',
    'node-1',
    'NODE',
    'A title',
    overrides.createdByHash ?? authorHash
  );
}

/** Minimal in-memory fake of IDiscussionRepository (fakes only, no DB). */
function makeDiscussionRepo(thread: DiscussionThread | null): {
  repo: IDiscussionRepository;
  updated: DiscussionThread[];
} {
  const updated: DiscussionThread[] = [];
  const repo: IDiscussionRepository = {
    async findThreadById() {
      return thread;
    },
    async listThreads() {
      return { items: [], nextCursor: null };
    },
    async saveThread() {},
    async update(t) {
      updated.push(t);
    },
    async listPosts() {
      return { items: [], nextCursor: null };
    },
    async findPostById(): Promise<DiscussionPost | null> {
      return null;
    },
    async savePost() {},
    async softDelete() {},
  };
  return { repo, updated };
}

/** No-op event publisher fake. */
function makeEventPublisher(): { publisher: IEventPublisher; events: string[] } {
  const events: string[] = [];
  const publisher: IEventPublisher = {
    async publish(event) {
      events.push(event);
    },
  };
  return { publisher, events };
}

describe('CloseThreadUseCase', () => {
  it('lets the creator close the thread and records the status update', async () => {
    const thread = makeThread({ createdByHash: authorHash });
    const { repo, updated } = makeDiscussionRepo(thread);
    const { publisher } = makeEventPublisher();

    const result = await new CloseThreadUseCase(repo, publisher).execute({
      threadId: thread.id,
      workspaceId: thread.workspaceId,
      tid: 'tenant-1',
      authorHash: authorHash.toString(),
    });

    expect(result).toBe(thread);
    expect(result.status).toBe('CLOSED');
    expect(updated).toHaveLength(1);
    expect(updated[0]).toBe(thread);
  });

  it('rejects a non-author with ERR_AUTHORIZATION_FAILED', async () => {
    const thread = makeThread();
    const { repo } = makeDiscussionRepo(thread);
    const { publisher } = makeEventPublisher();

    await expect(
      new CloseThreadUseCase(repo, publisher).execute({
        threadId: thread.id,
        workspaceId: thread.workspaceId,
        tid: 'tenant-1',
        authorHash: AuthorHash.fromIdentity('someone-else', 'salt').toString(),
      })
    ).rejects.toMatchObject({ code: 'ERR_AUTHORIZATION_FAILED' });
    expect(thread.status).toBe('OPEN');
  });

  it('reports a missing thread as ERR_THREAD_NOT_FOUND', async () => {
    const { repo } = makeDiscussionRepo(null);
    const { publisher } = makeEventPublisher();

    await expect(
      new CloseThreadUseCase(repo, publisher).execute({
        threadId: 'missing',
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        authorHash: authorHash.toString(),
      })
    ).rejects.toMatchObject({ code: 'ERR_THREAD_NOT_FOUND' });
  });

  it('reports a foreign-workspace thread as ERR_THREAD_NOT_FOUND', async () => {
    const thread = makeThread({ workspaceId: 'ws-other' });
    const { repo } = makeDiscussionRepo(thread);
    const { publisher } = makeEventPublisher();

    await expect(
      new CloseThreadUseCase(repo, publisher).execute({
        threadId: thread.id,
        workspaceId: 'ws-1',
        tid: 'tenant-1',
        authorHash: authorHash.toString(),
      })
    ).rejects.toMatchObject({ code: 'ERR_THREAD_NOT_FOUND' });
  });
});
