import { Request, Response, NextFunction } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../domain/entities/User.js';
import { SuperAdmin } from '../domain/entities/SuperAdmin.js';

/**
 * Middleware to ensure the authenticated user has the SuperAdmin role.
 * Must be used AFTER authenticateToken middleware.
 */
export function createAdminAuthMiddleware(em: EntityManager) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context || !req.context.userId) {
        res.status(401).json({ error: 'Unauthorized: No user context found.' });
        return;
      }

      const userId = req.context.userId;

      // Use a forked EM if needed, but since we are just reading the user, the provided EM is fine.
      // Forking it is a best practice in MikroORM for per-request operations.
      const forkedEm = em.fork();

      const user = await forkedEm.findOne(User, { id: userId }, { populate: ['roles'] });

      if (!user) {
        res.status(401).json({ error: 'Unauthorized: User not found.' });
        return;
      }

      const roles = user.roles.getItems();
      
      // Check if any of the user's roles is a SuperAdmin
      const isSuperAdmin = roles.some((role) => role instanceof SuperAdmin || role.constructor.name === 'SuperAdmin');

      if (!isSuperAdmin) {
        res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
        return;
      }

      next();
    } catch (error) {
      console.error('Admin Auth Middleware Error:', error);
      res.status(500).json({ error: 'Internal server error during authorization.' });
    }
  };
}
