import {
  IJoinRequestRepository,
  JoinRequestWithWorkspace,
} from '../../domain/ports/IJoinRequestRepository.js';

export interface ListMyJoinRequestsInput {
  userId: string;
  tid: string;
}

/** Use Case: the caller's own join requests, newest first. */
export class ListMyJoinRequestsUseCase {
  constructor(private readonly joinRequestRepo: IJoinRequestRepository) {}

  async execute(
    input: ListMyJoinRequestsInput
  ): Promise<JoinRequestWithWorkspace[]> {
    return this.joinRequestRepo.listByUser(input.userId, input.tid);
  }
}
