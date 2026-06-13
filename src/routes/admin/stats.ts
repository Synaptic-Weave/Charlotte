import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../../domain/entities/TwilioPhoneNumber.js';

export function createAdminStatsRouter(em: EntityManager): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      // Fork without running in a tenant transaction to query globally
      const globalEm = em.fork();
      
      const [totalTenants, totalNumbers] = await Promise.all([
        globalEm.count(Tenant),
        globalEm.count(TwilioPhoneNumber)
      ]);

      res.json({
        totalTenants,
        totalNumbers,
        mockLatency: '120ms',
      });
    } catch (error) {
      console.error('Error fetching global admin stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
