import { Router, Request, Response, NextFunction } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { AdminTenantService } from '../../services/AdminTenantService.js';

export function createAdminTenantsRouter(em: EntityManager): Router {
  const router = Router();
  const service = new AdminTenantService(em);

  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pageQuery = req.query.page as string;
      const limitQuery = req.query.limit as string;
      
      const page = pageQuery ? parseInt(pageQuery, 10) : 1;
      const limit = limitQuery ? parseInt(limitQuery, 10) : 10;
      
      if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
      }

      const result = await service.listTenants(page, limit);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching admin tenants:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
