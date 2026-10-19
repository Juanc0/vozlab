import { describe, expect, it } from 'vitest';
import { DeletePostUseCase } from '../../src/application/use_cases/DeletePostUseCase.js';
import { DiscussionPost } from '../../src/domain/entities/DiscussionPost.js';
import { DiscussionThread } from '../../src/domain/entities/DiscussionThread.js';
import { AuthorHash } from '../../src/domain/value_objects/AuthorHash.js';
import type { IDiscussionRepository } from '../../src/domain/ports/IDiscussionRepository.js';
import { makeEventPublisher } from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const authorHash = AuthorHash.fromIdentity('author-1', 'salt');
const otherHash = AuthorHash.fromIdentity('someone-else', 'salt');

function thread(id: string, workspaceId: string): DiscussionThread {
  return new DiscussionThread(id, workspaceId, 'node-1', 'NODE', 'A title', authorHash);
}

function post(id: string, threadId: string, author: AuthorHash): DiscussionPost {
  return new DiscussionPost(id, threadId, null, author, 'a comment');
}

interface DiscussionFake {
  repo: IDiscussionRepository;
  softDeleted: string[];
}

function makeDiscussionRepo(opts: {
  post?: DiscussionPost | null;
  threads?: DiscussionThread[];
}): DiscussionFake {
  const threads = new Map((opts.threads ?? []).map((t) => [t.id, t]));
  const softDeleted: string[] = [];
  const repo: IDiscussionRepository = {
    async findThreadById(id) {
      return threads.get(id) ?? null;
    },
    async listThreads() {
      return { items: [], nextCursor: null };
    },
    async saveThread() {},
    async update() {},
    async listPosts() {
      return { items: [], nextCursor: null };
    },
    async findPostById() {
      return opts.post ?? null;
    },
    async savePost() {},
    async softDelete(id) {
      softDeleted.push(id);
    },
  };
  return { repo, softDeleted };
}

const input = { postId: 'post-1', workspaceId: WS, tid, authorHash: authorHash.toString() };

describe('DeletePostUseCase', () => {
  it('soft-deletes the author-owned post and publishes', async () => {
    const { repo, softDeleted } = makeDiscussionRepo({
      post: post('post-1', 'thread-1', authorHash),
      threads: [thread('thread-1', WS)],
    });
    const { publisher, events } = makeEventPublisher();

    await new DeletePostUseCase(repo, publisher).execute(input);

    expect(softDeleted).toEqual(['post-1']);
    expect(events).toEqual(['POST_DELETED']);
  });

  it('reports a missing post as ERR_POST_NOT_FOUND', async () => {
    const { repo, softDeleted } = makeDiscussionRepo({ post: null, threads: [thread('thread-1', WS)] });
    const { publisher } = makeEventPublisher();

    await expect(new DeletePostUseCase(repo, publisher).execute(input)).rejects.toMatchObject({
      code: 'ERR_POST_NOT_FOUND',
    });
    expect(softDeleted).toEqual([]);
  });

  it('reports a post whose thread is foreign as ERR_THREAD_NOT_FOUND', async () => {
    const { repo, softDeleted } = makeDiscussionRepo({
      post: post('post-1', 'thread-1', authorHash),
      threads: [thread('thread-1', 'ws-other')],
    });
    const { publisher } = makeEventPublisher();

    await expect(new DeletePostUseCase(repo, publisher).execute(input)).rejects.toMatchObject({
      code: 'ERR_THREAD_NOT_FOUND',
    });
    expect(softDeleted).toEqual([]);
  });

  it('rejects a non-author with ERR_AUTHORIZATION_FAILED and does not delete', async () => {
    const { repo, softDeleted } = makeDiscussionRepo({
      post: post('post-1', 'thread-1', otherHash),
      threads: [thread('thread-1', WS)],
    });
    const { publisher } = makeEventPublisher();

    await expect(new DeletePostUseCase(repo, publisher).execute(input)).rejects.toMatchObject({
      code: 'ERR_AUTHORIZATION_FAILED',
    });
    expect(softDeleted).toEqual([]);
  });

  it('rejects ERR_POST_NOT_FOUND when the post does not belong to the requested thread', async () => {
    const { repo, softDeleted } = makeDiscussionRepo({
      post: post('post-1', 'thread-1', authorHash),
      threads: [thread('thread-1', WS), thread('thread-2', WS)],
    });
    const { publisher } = makeEventPublisher();

    await expect(
      new DeletePostUseCase(repo, publisher).execute({ ...input, threadId: 'thread-2' })
    ).rejects.toMatchObject({ code: 'ERR_POST_NOT_FOUND' });
    expect(softDeleted).toEqual([]);
  });
});
