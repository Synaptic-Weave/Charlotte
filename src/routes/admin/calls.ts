import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { CallSession } from '../../domain/entities/CallSession.js';

export function createAdminCallsRouter(em: EntityManager): Router {
  const router = Router();

  // GET /api/admin/calls/live
  router.get('/live', async (req: Request, res: Response): Promise<void> => {
    try {
      const forkedEm = em.fork();
      const activeCalls = await forkedEm.find(
        CallSession,
        { status: { $in: ['initiated', 'active'] } },
        { populate: ['tenant'] }
      );
      
      const safeCalls = activeCalls.map(c => ({
        id: c.id,
        callSid: c.callSid,
        status: c.status,
        callerNumber: c.callerNumber,
        tenant: c.tenant ? { id: c.tenant.id, name: c.tenant.name } : null,
        createdAt: c.createdAt
      }));

      res.status(200).json(safeCalls);
    } catch (error) {
      console.error('Error fetching live calls:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
