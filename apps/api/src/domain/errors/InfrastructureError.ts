import type { ErrorCode } from '@vozlab/shared-types';

/** A failure of an external dependency (DB/Redis), never a client mistake. */
export class InfrastructureError extends Error {
  constructor(public readonly code: ErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'InfrastructureError';
  }
}
