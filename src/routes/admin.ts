import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { createAdminStatsRouter } from './admin/stats.js';
import { createAdminCallsRouter } from './admin/calls.js';

export function createAdminRouter(em: EntityManager): Router {
  const router = Router();

  // Protect all /api/admin routes
  router.use(authenticateToken);
  router.use(requireAdmin);

  router.use('/stats', createAdminStatsRouter(em));
  router.use('/calls', createAdminCallsRouter(em));

  return router;
}
