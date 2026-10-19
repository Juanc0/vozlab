import { DbTransaction } from './Transaction.js';

/**
 * Port: Unit of Work — transaction boundary for atomic multi-table operations.
 *
 * Every transaction is scoped to a tenant (`tid`) because each tenant has
 * its own physical database. The implementation resolves the tenant pool
 * and opens the transaction against it.
 */
export interface IUnitOfWork {
  runInTransaction<T>(tid: string, work: (tx: DbTransaction) => Promise<T>): Promise<T>;
}
