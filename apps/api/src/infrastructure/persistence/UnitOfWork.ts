import { ConnectionPoolManager } from './ConnectionPoolManager.js';
import { IUnitOfWork } from '../../domain/ports/IUnitOfWork.js';
import { DbTransaction } from '../../domain/ports/Transaction.js';

/**
 * UnitOfWork: transactional boundary for tenant-scoped operations.
 *
 * Resolves the tenant's connection pool via the ConnectionPoolManager,
 * then runs the work inside a Drizzle transaction. All writes within the
 * callback share the same transaction and are committed/rolled back atomically.
 */
export class UnitOfWork implements IUnitOfWork {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  async runInTransaction<T>(
    tid: string,
    work: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.poolManager.getDb(tid);

    return db.transaction(async (tx) => {
      return work(tx);
    });
  }
}