import { AsyncLocalStorage } from 'async_hooks';
import { EntityManager } from '@mikro-orm/postgresql';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  role?: string;
}

// Global thread-scoped storage for tenant context
export const tenantLocalStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Retrieves the current request's tenant context from local storage.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantLocalStorage.getStore();
}

/**
 * Runs a query block inside a PostgreSQL transaction where the session variable
 * 'app.current_tenant_id' is set to the current tenant ID.
 * This guarantees that Postgres Row-Level Security (RLS) is strictly enforced
 * on all multi-tenant tables.
 *
 * @param em The root EntityManager instance
 * @param callback The database operations to perform inside the transaction
 */
export async function runInTenantTransaction<T>(
  em: EntityManager,
  callback: (forkedEm: EntityManager) => Promise<T>
): Promise<T> {
  const context = getTenantContext();
  if (!context || !context.tenantId) {
    throw new Error('Database transaction aborted: No active tenant context found on current execution thread.');
  }

  // Create a request-scoped fork of the EntityManager
  const fork = em.fork();

  return await fork.transactional(async (txEm) => {
    // Bind current_tenant_id to this local transaction
    await txEm.execute('SET LOCAL app.current_tenant_id = ?', [context.tenantId]);
    return await callback(txEm);
  });
}

/**
 * Runs a query block inside a PostgreSQL transaction where RLS is disabled.
 * This should only be used by system administrators or background workers
 * that need cross-tenant access.
 *
 * @param em The root EntityManager instance
 * @param callback The database operations to perform inside the transaction
 */
export async function runInGlobalTransaction<T>(
  em: EntityManager,
  callback: (forkedEm: EntityManager) => Promise<T>
): Promise<T> {
  const fork = em.fork();

  return await fork.transactional(async (txEm) => {
    // Disable RLS for this transaction (requires SUPERUSER or BYPASSRLS privilege)
    await txEm.execute('SET LOCAL row_security = OFF');
    return await callback(txEm);
  });
}
