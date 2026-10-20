import { fireEvent, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, renderGovernance, requestedUrls } from './harness/governance';
import { MAINTAINER_HASH, OTHER_HASH, POST, REPLY, THREAD } from './fixtures/governance';
import { NODE_A, NODE_B } from './fixtures/graph';
import { VoteLedger } from '$lib/governance/vote.svelte';
import DiscussionPanel from '../src/lib/components/DiscussionPanel.svelte';
import Discussions from '../src/routes/(app)/discussions/+page.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

const { pageState } = vi.hoisted(() => ({
  pageState: {
    // The uuid of `NODE_A` — `vi.hoisted` runs before the imports.
    url: new URL(
      'http://localhost:5173/discussions?target=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&type=NODE'
    )
  }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

interface Answers {
  readonly threads?: () => Response;
  readonly posts?: () => Response;
  readonly addPost?: () => Response;
  readonly deletePost?: () => Response;
  readonly closeThread?: () => Response;
}

/** The stub of the reads of the discussions screen. */
function stubFetch(answers: Answers = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/discussions/posts/') && method === 'DELETE') {
      return answers.deletePost ? answers.deletePost() : new Response(null, { status: 204 });
    }
    if (url.includes('/close')) {
      return answers.closeThread
        ? answers.closeThread()
        : json({ thread: { ...THREAD, status: 'CLOSED' } });
    }
    if (url.includes('/posts')) {
      if (method === 'POST') {
        return answers.addPost
          ? answers.addPost()
          : json({ id: REPLY.id, threadId: THREAD.id, parentPostId: POST.id, communityScore: 0 }, 201);
      }
      return answers.posts ? answers.posts() : json({ posts: [POST, REPLY], nextCursor: null });
    }
    if (url.includes('/discussions')) {
      if (method === 'POST') {
        return json(
          {
            id: THREAD.id,
            targetId: NODE_A.id,
            targetType: 'NODE',
            title: 'A brand new thread',
            status: 'OPEN'
          },
          201
        );
      }
      return answers.threads ? answers.threads() : json({ threads: [THREAD], nextCursor: null });
    }
    if (url.includes('/nodes')) {
      return json({ nodes: [NODE_A], nextCursor: null });
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  });
}

/** Opens the first thread and waits for its comments. */
async function openThread(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: THREAD.title })).toBeInTheDocument();
  });

  await fireEvent.click(screen.getByRole('button', { name: THREAD.title }));

  await waitFor(() => {
    expect(screen.getByText(POST.body)).toBeInTheDocument();
  });
}

describe('the discussions of a target', () => {
  beforeEach(() => {
    sessionStorage.clear();
    goto.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the threads of the target named in the URL', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: THREAD.title })).toBeInTheDocument();
    });

    const threadCall = requestedUrls(fetchMock).find((url) => url.includes('/discussions?'));
    expect(threadCall).toContain(`targetId=${NODE_A.id}`);
    expect(threadCall).toContain('targetType=NODE');
  });

  it('shows the close-thread control to the creator of the thread only', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar el hilo' })).toBeInTheDocument();
    });
  });

  it('hides the close-thread control from everybody else', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: OTHER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: THREAD.title })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Cerrar el hilo' })).not.toBeInTheDocument();
  });

  it('shows the delete control to the author of the comment only', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: OTHER_HASH, fetch: fetchMock });

    await openThread();

    // The author of the first comment may delete it.
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    // The reply of the maintainer is not theirs.
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(1);
  });

  it('hides the delete control from everybody but the author', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await openThread();

    // Only the reply of the maintainer is theirs.
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(1);
  });

  it('posts a reply under its parent and reads the thread again', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await openThread();

    await fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[0]);

    await fireEvent.input(screen.getByLabelText(/Escribe una respuesta/), {
      target: { value: 'The budget covers it.' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Publicar la respuesta' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (entry) => String(entry[0]).includes('/posts') && entry[1]?.method === 'POST'
      );
      expect(call).toBeDefined();
    });

    const post = fetchMock.mock.calls.find(
      (entry) => String(entry[0]).includes('/posts') && entry[1]?.method === 'POST'
    );
    const body = JSON.parse(String(post?.[1]?.body)) as {
      body: string;
      parentPostId?: string;
    };

    expect(body.body).toBe('The budget covers it.');
    expect(body.parentPostId).toBe(POST.id);

    // The thread is read again after the reply.
    await waitFor(() => {
      const postReads = fetchMock.mock.calls.filter(
        (entry) => String(entry[0]).includes('/posts') && entry[1]?.method !== 'POST'
      );
      expect(postReads.length).toBeGreaterThan(1);
    });
  });

  it('closes a thread and shows its new state', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar el hilo' })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar el hilo' }));

    await waitFor(() => {
      expect(
        screen.getByText('Se ha cerrado el hilo «Should the shuttle run every 30 minutes?».')
      ).toBeInTheDocument();
    });
  });

  it('shows the refusal of the API when the close is refused', async () => {
    const fetchMock = stubFetch({
      closeThread: () =>
        json({ code: 'ERR_AUTHORIZATION_FAILED', message: 'Only the creator may close a thread' }, 403)
    });
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar el hilo' })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cerrar el hilo' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('ERR_AUTHORIZATION_FAILED');
    });
  });

  it('deletes a comment of the author', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: OTHER_HASH, fetch: fetchMock });

    await openThread();

    await fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(screen.getByText('El comentario se ha eliminado.')).toBeInTheDocument();
    });

    const deletion = fetchMock.mock.calls.find(
      (entry) => entry[1]?.method === 'DELETE'
    );
    expect(String(deletion?.[0])).toContain(`/discussions/posts/${POST.id}`);
  });

  it('drops the open thread when the target changes', async () => {
    const fetchMock = stubFetch();
    const { rerender } = renderGovernance(
      DiscussionPanel,
      { authorHash: MAINTAINER_HASH, fetch: fetchMock },
      { targetId: NODE_A.id, targetType: 'NODE', ledger: new VoteLedger() }
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: THREAD.title })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: THREAD.title }));

    await waitFor(() => {
      expect(screen.getByText(POST.body)).toBeInTheDocument();
    });

    // Another target: the thread of the previous one is dropped.
    await rerender({ targetId: NODE_B.id, targetType: 'NODE', ledger: new VoteLedger() });

    await waitFor(() => {
      expect(screen.queryByText(POST.body)).not.toBeInTheDocument();
    });
  });

  it('starts a thread about the target', async () => {
    const fetchMock = stubFetch();
    renderGovernance(Discussions, { authorHash: MAINTAINER_HASH, fetch: fetchMock });

    await waitFor(() => {
      expect(screen.getByLabelText('Hilo nuevo')).toBeInTheDocument();
    });

    await fireEvent.input(screen.getByLabelText('Hilo nuevo'), {
      target: { value: 'A brand new thread' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Abrir el hilo' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (entry) => String(entry[0]).endsWith('/discussions') && entry[1]?.method === 'POST'
      );
      expect(call).toBeDefined();
    });

    const created = fetchMock.mock.calls.find(
      (entry) => String(entry[0]).endsWith('/discussions') && entry[1]?.method === 'POST'
    );
    const body = JSON.parse(String(created?.[1]?.body)) as {
      targetId: string;
      targetType: string;
      title: string;
    };

    expect(body.targetId).toBe(NODE_A.id);
    expect(body.targetType).toBe('NODE');
    expect(body.title).toBe('A brand new thread');
  });
});
