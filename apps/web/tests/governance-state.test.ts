import { describe, expect, it } from 'vitest';
import { buildPostTree, countPosts } from '$lib/governance/posts';
import { VoteLedger } from '$lib/governance/vote.svelte';
import { POST, REPLY } from './fixtures/governance';

describe('the vote ledger', () => {
  it('shows the score of the server when nothing was cast', () => {
    const ledger = new VoteLedger();

    expect(ledger.score('target-1', 7)).toBe(7);
    expect(ledger.votedType('target-1')).toBeNull();
  });

  it('moves the score optimistically', () => {
    const ledger = new VoteLedger();

    ledger.applyOptimistic('target-1', 7, 'UPVOTE');

    expect(ledger.score('target-1', 7)).toBe(8);
  });

  it('keeps the optimistic score when the vote is counted', () => {
    const ledger = new VoteLedger();

    const vote = ledger.applyOptimistic('target-1', 7, 'UPVOTE');
    ledger.confirm('target-1', vote, { counted: true });

    expect(ledger.score('target-1', 7)).toBe(8);
    expect(ledger.votedType('target-1')).toBe('UPVOTE');
  });

  it('rolls the score back to the exact value it had', () => {
    const ledger = new VoteLedger();

    const vote = ledger.applyOptimistic('target-1', 7, 'UPVOTE');
    ledger.rollback('target-1', vote);

    expect(ledger.score('target-1', 7)).toBe(7);
    expect(ledger.votedType('target-1')).toBeNull();
  });

  it('undoes the bump of an idempotent repeat', () => {
    const ledger = new VoteLedger();

    const first = ledger.applyOptimistic('target-1', 7, 'UPVOTE');
    ledger.confirm('target-1', first, { counted: true });

    // The server answers `201` but does not move the counter again.
    const repeat = ledger.applyOptimistic('target-1', 7, 'UPVOTE');
    ledger.confirm('target-1', repeat, { counted: false });

    expect(ledger.score('target-1', 7)).toBe(8);
  });

  it('keeps the delta of the other vote when one of them fails', () => {
    const ledger = new VoteLedger();

    const first = ledger.applyOptimistic('target-1', 7, 'UPVOTE');
    const second = ledger.applyOptimistic('target-1', 7, 'DOWNVOTE');

    expect(ledger.score('target-1', 7)).toBe(7);

    ledger.rollback('target-1', first);

    // The second vote is still optimistic: the failed one left no trace.
    expect(ledger.score('target-1', 7)).toBe(6);
    expect(ledger.score('target-1', 7)).not.toBe(7);

    ledger.confirm('target-1', second, { counted: true });
    expect(ledger.score('target-1', 7)).toBe(6);
  });

  it('adopts the score of a fresh read', () => {
    const ledger = new VoteLedger();

    ledger.sync('target-1', 12);

    expect(ledger.score('target-1', 7)).toBe(12);
  });

  it('keeps the optimistic state while a vote is in flight', () => {
    const ledger = new VoteLedger();

    const vote = ledger.applyOptimistic('target-1', 7, 'UPVOTE');

    // A read that arrives while the vote is in flight does not overwrite the
    // optimistic state: the server may or may not have counted it yet.
    ledger.sync('target-1', 12);
    expect(ledger.score('target-1', 7)).toBe(8);

    // The rollback restores the exact value the target had before the vote.
    ledger.rollback('target-1', vote);
    expect(ledger.score('target-1', 7)).toBe(7);
  });
});

describe('the tree of the comments', () => {
  it('nests the replies under their parent', () => {
    const tree = buildPostTree([POST, REPLY]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.post.id).toBe(POST.id);
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.post.id).toBe(REPLY.id);
  });

  it('keeps an orphan whose parent is missing', () => {
    const tree = buildPostTree([REPLY]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.post.id).toBe(REPLY.id);
  });

  it('counts every comment', () => {
    expect(countPosts(buildPostTree([POST, REPLY]))).toBe(2);
    expect(countPosts(buildPostTree([]))).toBe(0);
  });
});
