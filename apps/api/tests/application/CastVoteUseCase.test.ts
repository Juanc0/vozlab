import { testHash } from '../support/hash.js';
import { describe, expect, it } from 'vitest';

import { CastVoteUseCase } from '../../src/application/use_cases/CastVoteUseCase.js';
import {
  Interaction,
  InteractionType,
} from '../../src/domain/entities/Interaction.js';
import type { DbTransaction } from '../../src/domain/ports/Transaction.js';
import type { IInteractionRepository } from '../../src/domain/ports/IInteractionRepository.js';
import { makeEventPublisher, makeUnitOfWork, TX_SENTINEL } from '../support/fakes.js';

const WS = 'ws-1';
const tid = 'tenant-1';
const userHash = testHash('user-1').toString();

interface InteractionFake {
  repo: IInteractionRepository;
  calls: string[];
  appliedDeltas: Array<{ delta: number; tx: DbTransaction | undefined }>;
}

function makeInteractionRepo(
  opts: { existing?: Interaction | null; targetExists?: boolean } = {}
): InteractionFake {
  const calls: string[] = [];
  const appliedDeltas: InteractionFake['appliedDeltas'] = [];
  const repo: IInteractionRepository = {
    async findByUserAndTarget() {
      return opts.existing ?? null;
    },
    async existsInWorkspace() {
      return opts.targetExists ?? true;
    },
    async save(_interaction, _tid, tx) {
      calls.push('save');
      expect(tx).toBe(TX_SENTINEL);
    },
    async applyScoreDelta(_id, _type, delta, _tid, tx) {
      calls.push('applyScoreDelta');
      appliedDeltas.push({ delta, tx });
    },
  };
  return { repo, calls, appliedDeltas };
}

function vote(type: InteractionType) {
  return { targetId: 'node-1', targetType: 'NODE' as const, interactionType: type, workspaceId: WS, tid, userHash };
}

function existingVote(type: InteractionType): Interaction {
  return new Interaction('ix-1', WS, testHash('user-1'), 'node-1', 'NODE', type, 1);
}

describe('CastVoteUseCase', () => {
  it('derives delta -1 and applies it through the transaction for DOWNVOTE', async () => {
    const { repo, calls, appliedDeltas } = makeInteractionRepo();
    const { uow, ran } = makeUnitOfWork();
    const { publisher, events } = makeEventPublisher();

    await new CastVoteUseCase(repo, uow, publisher).execute(vote('DOWNVOTE'));

    expect(calls).toEqual(['save', 'applyScoreDelta']);
    expect(appliedDeltas).toEqual([{ delta: -1, tx: TX_SENTINEL }]);
    expect(ran.count).toBe(1);
    expect(events).toEqual(['INTERACTION_CAST']);
  });

  it.each<InteractionType>(['UPVOTE', 'SUPPORT', 'VALIDATE'])(
    'derives delta +1 for %s',
    async (type) => {
      const { repo, appliedDeltas } = makeInteractionRepo();
      const { uow } = makeUnitOfWork();
      const { publisher } = makeEventPublisher();

      await new CastVoteUseCase(repo, uow, publisher).execute(vote(type));

      expect(appliedDeltas).toHaveLength(1);
      expect(appliedDeltas[0].delta).toBe(1);
    }
  );

  it('rejects a missing/foreign target and inserts nothing', async () => {
    const { repo, calls } = makeInteractionRepo({ targetExists: false });
    const { uow, ran } = makeUnitOfWork();
    const { publisher } = makeEventPublisher();

    await expect(
      new CastVoteUseCase(repo, uow, publisher).execute(vote('UPVOTE'))
    ).rejects.toMatchObject({ code: 'ERR_NODE_NOT_FOUND' });

    expect(calls).toEqual([]);
    expect(ran.count).toBe(0);
  });

  it('is idempotent for an existing identical vote (no insert)', async () => {
    const existing = existingVote('UPVOTE');
    const { repo, calls } = makeInteractionRepo({ existing });
    const { uow, ran } = makeUnitOfWork();
    const { publisher } = makeEventPublisher();

    const result = await new CastVoteUseCase(repo, uow, publisher).execute(vote('UPVOTE'));

    expect(result).toBe(existing);
    expect(calls).toEqual([]);
    expect(ran.count).toBe(0);
  });

  it('rejects an existing different vote with ERR_DUPLICATE_INTERACTION', async () => {
    const { repo, calls } = makeInteractionRepo({ existing: existingVote('DOWNVOTE') });
    const { uow } = makeUnitOfWork();
    const { publisher } = makeEventPublisher();

    await expect(
      new CastVoteUseCase(repo, uow, publisher).execute(vote('UPVOTE'))
    ).rejects.toMatchObject({ code: 'ERR_DUPLICATE_INTERACTION' });

    expect(calls).toEqual([]);
  });
});
