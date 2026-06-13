import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { CallSession } from '../../domain/entities/CallSession.js';

export function createAdminCallsRouter(em: EntityManager): Router {
  const router = Router();

  router.get('/live', async (req: Request, res: Response) => {
    try {
      // Fork without running in a tenant transaction to query globally
      const globalEm = em.fork();
      
      const liveCalls = await globalEm.find(
        CallSession,
        {
          status: { $in: ['active', 'initiated'] }
        },
        {
          orderBy: { createdAt: 'DESC' }
        }
      );

      // Return DTOs instead of raw entities
      const mapped = liveCalls.map((session) => ({
        id: session.id,
        tenantId: session.tenant.id,
        callSid: session.callSid,
        callerNumber: session.callerNumber,
        status: session.status,
        createdAt: session.createdAt
      }));

      res.json(mapped);
    } catch (error) {
      console.error('Error fetching live calls:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
