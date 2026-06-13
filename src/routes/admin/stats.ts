import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../../domain/entities/TwilioPhoneNumber.js';

export function createAdminStatsRouter(em: EntityManager): Router {
  const router = Router();

  // GET /api/admin/stats
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const forkedEm = em.fork();
      const totalTenants = await forkedEm.count(Tenant, {});
      const totalNumbers = await forkedEm.count(TwilioPhoneNumber, {});
      
      res.status(200).json({
        totalTenants,
        totalNumbers,
        latencyAverage: 120 // mocked for now
      });
    } catch (error) {
      console.error('Error fetching global stats:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
