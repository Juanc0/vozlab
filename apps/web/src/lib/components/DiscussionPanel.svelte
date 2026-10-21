<script lang="ts">
  /**
   * The discussion of a target (FR-11, FR-16).
   *
   * A discussion is always about something: the threads are the ones of the
   * target (`targetId` + `targetType` — both are required by the API).
   *
   * The controls are **hints**, not the enforcement: the close-thread
   * control is shown to the creator of the thread and the delete-post
   * control to the author of the post, because those are the only two the
   * API accepts. The API re-checks both and its refusal is shown.
   */
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import {
    addPost,
    closeThread,
    createThread,
    deletePost,
    listPosts,
    listThreads,
    POSTS_DEFAULT_LIMIT
  } from '$lib/api/discussions';
  import type { DiscussionTargetType, PostDto, ThreadDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import { buildPostTree, type PostNode } from '$lib/governance/posts';
  import { canCloseThread, canDeletePost } from '$lib/governance/permissions';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import { formatDate } from '$lib/i18n';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import VoteButtons from './VoteButtons.svelte';

  interface Props {
    /** The id of the object the discussion is about. */
    targetId: string;
    /** The kind of the object the discussion is about. */
    targetType: DiscussionTargetType;
    /** The session-local state of the votes. */
    ledger: VoteLedger;
    /** The heading of the section. */
    heading?: string;
    /**
     * `true` leaves the card of the panel out.
     *
     * The inspector shows the forum inside a column that is already a card:
     * a card inside a card is noise, and the reader loses the thread of the
     * page.
     */
    bare?: boolean;
  }

  let { targetId, targetType, ledger, heading, bare = false }: Props = $props();

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The ids of the sections.
   *
   * The panel may be rendered more than once on a page, so the ids cannot
   * be fixed.
   */
  const uid = $props.id();
  const headingId = `discussion-heading-${uid}`;
  const postsHeadingId = `thread-posts-heading-${uid}`;

  /** The heading of the section. */
  const sectionHeading = $derived(heading ?? t('discussion.heading'));

  /** The threads of the target. */
  let threads = $state.raw<ThreadDto[]>([]);
  let threadsCursor = $state<string | null>(null);
  let threadsLoading = $state(false);
  let threadsError = $state<ApiFailure | null>(null);

  /** The thread whose posts are read. */
  let selectedThreadId = $state<string | null>(null);
  let posts = $state.raw<PostDto[]>([]);
  let postsCursor = $state<string | null>(null);
  let postsLoading = $state(false);
  let postsError = $state<ApiFailure | null>(null);

  /** The new thread. */
  let newTitle = $state('');
  let creating = $state(false);

  /** The reply being written. */
  let replyBody = $state('');
  let replyParentId = $state<string | null>(null);
  let posting = $state(false);

  /** The action in flight (close, delete). */
  let busyId = $state<string | null>(null);

  /** The outcome of the last action — the API's own code and message. */
  let actionError = $state<ApiFailure | null>(null);
  let notice = $state<string | null>(null);

  /** The counters that discard the answer of a superseded request. */
  let threadsRequest = 0;
  let postsRequest = 0;

  /** The target whose threads are loaded — the key of the open thread. */
  let loadedTarget = '';

  /** The tree of the posts of the selected thread. */
  const postTree = $derived(buildPostTree(posts));

  /** The pseudonym of the signed-in user — the comparison the API makes. */
  const authorHash = $derived(session.user?.authorHash ?? null);

  /** The thread whose posts are read. */
  const selectedThread = $derived(threads.find((thread) => thread.id === selectedThreadId) ?? null);

  /**
   * Reads the threads of the target.
   *
   * The effect reads the workspace, the target and nothing else: the list
   * it fills is never a dependency of the effect.
   */
  $effect(() => {
    const workspaceId = workspace.currentWorkspaceId;
    const id = targetId;
    const type = targetType;

    if (workspaceId === '' || id === '') {
      return;
    }

    // Another target (or another workspace): the thread that was open
    // belongs to the previous one and is dropped.
    const key = `${workspaceId}:${type}:${id}`;
    if (key !== loadedTarget) {
      loadedTarget = key;
      selectedThreadId = null;
      posts = [];
      postsCursor = null;
    }

    void loadThreads(id, type);
  });

  /** Reads the posts of the selected thread. */
  $effect(() => {
    const id = selectedThreadId;

    if (id === null) {
      posts = [];
      postsCursor = null;
      postsError = null;
      return;
    }

    void loadPosts(id);
  });

  /** Reads one page of the threads of the target. */
  async function loadThreads(
    id: string,
    type: DiscussionTargetType,
    cursor: string | null = null
  ): Promise<void> {
    const current = (threadsRequest += 1);
    threadsLoading = true;
    threadsError = null;

    try {
      const result = await listThreads(api, { targetId: id, targetType: type, cursor });
      if (current !== threadsRequest) {
        return;
      }

      threads = cursor === null ? result.items : [...threads, ...result.items];
      threadsCursor = result.nextCursor;
    } catch (caught) {
      if (current !== threadsRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      threadsError = describeFailure(caught, t);
    } finally {
      if (current === threadsRequest) {
        threadsLoading = false;
      }
    }
  }

  /** Reads one page of the posts of a thread. */
  async function loadPosts(threadId: string, cursor: string | null = null): Promise<void> {
    const current = (postsRequest += 1);
    postsLoading = true;
    postsError = null;

    try {
      const result = await listPosts(api, { threadId, cursor });
      if (current !== postsRequest) {
        return;
      }

      posts = cursor === null ? result.items : [...posts, ...result.items];
      postsCursor = result.nextCursor;

      // The server's score is the source of truth of every post.
      for (const post of result.items) {
        ledger.sync(post.id, post.communityScore);
      }
    } catch (caught) {
      if (current !== postsRequest) {
        return;
      }
      if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
        return;
      }
      postsError = describeFailure(caught, t);
    } finally {
      if (current === postsRequest) {
        postsLoading = false;
      }
    }
  }

  /** Opens a thread and reads its posts. */
  function selectThread(threadId: string): void {
    selectedThreadId = threadId;
    posts = [];
    postsCursor = null;
    actionError = null;
  }

  /** Starts a new thread about the target. */
  async function startThread(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const title = newTitle.trim();
    if (title.length < 3) {
      actionError = {
        code: 'ERR_VALIDATION_FAILED',
        message: t('discussion.titleTooShort')
      };
      return;
    }

    creating = true;
    actionError = null;
    notice = null;

    try {
      const created = await createThread(api, { targetId, targetType, title });
      newTitle = '';
      notice = t('discussion.threadOpened', { title: created.title });
      await loadThreads(targetId, targetType);
      selectThread(created.id);
    } catch (caught) {
      actionError = describeFailure(caught, t);
    } finally {
      creating = false;
    }
  }

  /** Posts the reply that is being written. */
  async function postReply(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const body = replyBody.trim();
    const threadId = selectedThreadId;

    if (threadId === null) {
      return;
    }
    if (body === '') {
      actionError = { code: 'ERR_VALIDATION_FAILED', message: t('discussion.emptyReply') };
      return;
    }

    posting = true;
    actionError = null;
    notice = null;

    const parentPostId = replyParentId;

    try {
      await addPost(api, threadId, {
        body,
        ...(parentPostId === null ? {} : { parentPostId })
      });
      replyBody = '';
      replyParentId = null;
      notice =
        parentPostId === null
          ? t('discussion.commentPosted')
          : t('discussion.replyPosted');
      // The thread is read again: the new post is shown in place.
      await loadPosts(threadId);
    } catch (caught) {
      actionError = describeFailure(caught, t);
    } finally {
      posting = false;
    }
  }

  /** Closes a thread — the creator only (the API re-checks). */
  async function closeThreadNow(thread: ThreadDto): Promise<void> {
    busyId = thread.id;
    actionError = null;
    notice = null;

    try {
      const closed = await closeThread(api, thread.id);
      threads = threads.map((candidate) => (candidate.id === closed.id ? closed : candidate));
      notice = t('discussion.threadClosed', { title: closed.title });
    } catch (caught) {
      actionError = describeFailure(caught, t);
    } finally {
      busyId = null;
    }
  }

  /** Deletes a post — the author only (the API re-checks). */
  async function removePost(post: PostDto): Promise<void> {
    busyId = post.id;
    actionError = null;
    notice = null;

    try {
      await deletePost(api, post.id);
      notice = t('discussion.commentDeleted');
      // The thread is read again: the deleted post is gone from the list.
      await loadPosts(post.threadId);
    } catch (caught) {
      actionError = describeFailure(caught, t);
    } finally {
      busyId = null;
    }
  }

  /** Starts a reply under a post. */
  function startReply(postId: string): void {
    replyParentId = postId;
    actionError = null;
  }

  /**
   * Reads the score of a comment back after a vote.
   *
   * The API has no read for the interactions and no read for a single
   * comment: the thread is read again and the score of the comment is taken
   * from it. The server is the authority — a vote of the **same** type is
   * idempotent and does not move the counter again.
   */
  async function reconcilePostScore(postId: string): Promise<number | null> {
    const threadId = selectedThreadId;
    if (threadId === null) {
      return null;
    }

    try {
      const result = await listPosts(api, { threadId, limit: POSTS_DEFAULT_LIMIT });
      const found = result.items.find((post) => post.id === postId);
      return found?.communityScore ?? null;
    } catch {
      return null;
    }
  }

  /** Cancels the reply that was being written. */
  function cancelReply(): void {
    replyParentId = null;
    replyBody = '';
  }

  /** The post a reply is aimed at — it is named above the reply box. */
  const replyParent = $derived(posts.find((post) => post.id === replyParentId) ?? null);
</script>

<section aria-labelledby={headingId} class={bare ? '' : 'rounded-card bg-surface p-4'}>
  <h2 id={headingId}>
    {sectionHeading}
  </h2>

  {#if notice}
    <p role="status" class="mt-2 rounded-control bg-raised p-2 text-body">{notice}</p>
  {/if}

  {#if actionError}
    <p role="alert" class="mt-2 rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
      <span class="font-mono">{actionError.code}</span> — {actionError.message}
    </p>
  {/if}

  {#if threadsError}
    <p role="alert" class="mt-2 rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
      <span class="font-mono">{threadsError.code}</span> — {threadsError.message}
    </p>
  {/if}

  <form class="mt-3 flex flex-wrap items-end gap-2" onsubmit={startThread}>
    <div class="min-w-0 flex-1">
      <label for="thread-title" class="field-label">
        {t('discussion.newThread')}
      </label>
      <input
        id="thread-title"
        type="text"
        minlength="3"
        maxlength="255"
        required
        class="field mt-0.5 w-full"
        placeholder={t('discussion.newThreadPlaceholder')}
        bind:value={newTitle}
      />
    </div>
    <button
      type="submit"
      class="btn btn-secondary"
      disabled={creating}
    >
      {creating ? t('discussion.opening') : t('discussion.startThread')}
    </button>
  </form>

  {#if threadsLoading && threads.length === 0}
    <p role="status" class="mt-3 text-body text-muted">{t('discussion.loadingThreads')}</p>
  {:else if threads.length === 0}
    <p class="mt-3 text-body text-muted">{t('discussion.noThreads')}</p>
  {:else}
    <ul class="mt-3 divide-y divide-rule">
      {#each threads as thread (thread.id)}
        <li class="py-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <button
              type="button"
              class="rounded-control text-left font-medium text-text hover:bg-raised hover:text-accent-ink hover:underline hover:underline-offset-2 aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent-ink aria-[current=true]:font-semibold"
              aria-current={selectedThreadId === thread.id ? 'true' : undefined}
              onclick={() => selectThread(thread.id)}
            >
              {thread.title}
            </button>
            <span class="text-small text-muted">
              {thread.status}
              {#if thread.status === 'CLOSED'}
                {t('discussion.closedSuffix')}
              {/if}
            </span>
          </div>

          {#if canCloseThread(thread, authorHash)}
            <button
              type="button"
              class="btn btn-secondary mt-1"
              disabled={busyId === thread.id || thread.status === 'CLOSED'}
              onclick={() => void closeThreadNow(thread)}
            >
              {thread.status === 'CLOSED'
                ? t('discussion.threadClosedLabel')
                : t('discussion.closeThread')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    {#if threadsCursor !== null}
      <button
        type="button"
        class="btn btn-secondary mt-3"
        disabled={threadsLoading}
        onclick={() => void loadThreads(targetId, targetType, threadsCursor)}
      >
        {threadsLoading ? t('common.loading') : t('discussion.showOlderThreads')}
      </button>
    {/if}
  {/if}

  {#if selectedThread !== null}
    <section aria-labelledby={postsHeadingId} class="mt-5 border-t border-rule pt-4">
      <h3 id={postsHeadingId}>
        {t('discussion.commentsOf', { title: selectedThread.title })}
      </h3>

      {#if postsError}
        <p role="alert" class="mt-2 rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
          <span class="font-mono">{postsError.code}</span> — {postsError.message}
        </p>
      {/if}

      {#if postsLoading && posts.length === 0}
        <p role="status" class="mt-2 text-body text-muted">{t('discussion.loadingComments')}</p>
      {:else if posts.length === 0}
        <p class="mt-2 text-body text-muted">{t('discussion.noComments')}</p>
      {:else}
        {@render postList(postTree, 0)}
      {/if}

      {#if postsCursor !== null}
        <button
          type="button"
          class="btn btn-secondary mt-3"
          disabled={postsLoading}
          onclick={() => void loadPosts(selectedThread.id, postsCursor)}
        >
          {postsLoading ? t('common.loading') : t('discussion.showOlderComments')}
        </button>
      {/if}

      <form class="mt-4" onsubmit={postReply}>
        <label for="reply-body" class="field-label">
          {replyParent === null ? t('discussion.writeComment') : t('discussion.writeReply')}
        </label>

        {#if replyParent !== null}
          <p class="mt-1 flex items-center gap-2 text-small text-muted">
            <span>
              {t('discussion.replyingTo', {
                body: `${replyParent.body.slice(0, 80)}${replyParent.body.length > 80 ? '…' : ''}`
              })}
            </span>
            <button
              type="button"
              class="btn btn-quiet"
              onclick={cancelReply}
            >
              {t('discussion.cancelReply')}
            </button>
          </p>
        {/if}

        <textarea
          id="reply-body"
          rows="3"
          maxlength="5000"
          required
          class="field-area mt-1 w-full"
          placeholder={t('discussion.commentPlaceholder')}
          bind:value={replyBody}
        ></textarea>

        <button
          type="submit"
          class="btn btn-primary mt-2"
          disabled={posting}
        >
          {posting
            ? t('discussion.posting')
            : replyParent === null
              ? t('discussion.postComment')
              : t('discussion.postReply')}
        </button>
      </form>
    </section>
  {/if}
</section>

{#snippet postList(nodes: PostNode[], depth: number)}
  <ul class="mt-2 space-y-3">
    {#each nodes as node (node.post.id)}
      <li class={depth === 0 ? '' : 'border-l border-rule pl-3'}>
        <article class="rounded-control bg-raised p-2">
          <header class="flex flex-wrap items-center gap-2 text-small text-muted">
            <span class="font-mono break-all">{node.post.authorHash}</span>
            <time datetime={node.post.createdAt}>
              {formatDate(locale.locale, node.post.createdAt)}
            </time>
          </header>

          <p class="mt-1 text-body whitespace-pre-wrap break-words">{node.post.body}</p>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <VoteButtons
              {ledger}
              targetId={node.post.id}
              targetType="POST"
              score={node.post.communityScore}
              label={t('vote.thisComment')}
              reconcile={() => reconcilePostScore(node.post.id)}
            />

            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => startReply(node.post.id)}
            >
              {t('discussion.reply')}
            </button>

            {#if canDeletePost(node.post, authorHash)}
              <button
                type="button"
                class="btn btn-secondary text-pill-negative-ink"
                disabled={busyId === node.post.id}
                onclick={() => void removePost(node.post)}
              >
                {t('discussion.delete')}
              </button>
            {/if}
          </div>
        </article>

        {#if node.children.length > 0}
          {@render postList(node.children, depth + 1)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}
