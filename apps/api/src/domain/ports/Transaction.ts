/**
 * Opaque transaction handle threaded through repositories so a multi-table
 * write can run atomically. The concrete type is provided by the
 * persistence adapter (Drizzle); the domain only needs to pass it through.
 */
export type DbTransaction = unknown;
