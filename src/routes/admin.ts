import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { authenticateToken } from '../middleware/auth.js';
import { createAdminAuthMiddleware } from '../middleware/adminAuth.js';
import { createAdminRolesRouter } from './admin/roles.js';
import { createAdminStatsRouter } from './admin/stats.js';
import { createAdminCallsRouter } from './admin/calls.js';
import { createAdminTenantsRouter } from './admin/tenants.js';
import { createAdminLogsRouter } from './admin/logs.js';

export function createAdminRouter(em: EntityManager): Router {
  const router = Router();

  // 1. Authenticate token (extracts user and sets req.context)
  router.use(authenticateToken);

  // 2. Authorize SuperAdmin access
  router.use(createAdminAuthMiddleware(em));

  // 3. Mount sub-routers
  // The roles router provides:
  // - GET /api/admin/roles
  // - PUT /api/admin/roles/:id
  // - POST /api/admin/users/:userId/roles
  router.use('/', createAdminRolesRouter(em));
  
  router.use('/stats', createAdminStatsRouter(em));
  router.use('/calls', createAdminCallsRouter(em));
  router.use('/tenants', createAdminTenantsRouter(em));
  router.use('/logs', createAdminLogsRouter(em));

  return router;
}
