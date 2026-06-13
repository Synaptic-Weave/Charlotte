import { Router } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../../domain/entities/User.js';
import { SuperAdmin } from '../../domain/entities/SuperAdmin.js';
import { TenantAdmin } from '../../domain/entities/TenantAdmin.js';
import { runInTenantTransaction } from '../../db/context.js';

export function createAdminRolesRouter(em: EntityManager): Router {
  const router = Router();

  /**
   * POST /api/admin/roles
   * Assign a role to a user.
   */
  router.post('/', async (req, res) => {
    try {
      const { email, roleType } = req.body;

      if (!email || !roleType) {
        res.status(400).json({ error: 'Email and roleType are required.' });
        return;
      }

      const fork = em.fork();
      const user = await fork.findOne<User>(User, { email: email.toLowerCase().trim() } as any, { populate: ['role'] as any });
      
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      await runInTenantTransaction(fork, async (txEm) => {
        let newRole;
        if (roleType === 'super_admin') {
          newRole = new SuperAdmin();
        } else if (roleType === 'tenant_admin') {
          newRole = new TenantAdmin();
        } else {
          throw Object.assign(new Error('Invalid roleType.'), { status: 400 });
        }
        
        txEm.persist(newRole);
        user.updateRole(newRole);
        txEm.persist(user);
      });

      res.status(200).json({ message: 'Role assigned successfully.' });
    } catch (error: any) {
      console.error('Error assigning role:', error);
      const status = error.status || 500;
      res.status(status).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  /**
   * GET /api/admin/roles
   * List users and their roles.
   */
  router.get('/', async (req, res) => {
    try {
      const fork = em.fork();
      const users = await fork.find<User>(User, {}, { populate: ['role', 'tenant'] as any });
      
      const userList = users.map(u => ({
        id: u.id,
        email: u.email,
        role: (u.role as any).type || 'tenant_admin',
        tenantName: u.tenant.name
      }));

      res.status(200).json({ users: userList });
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Internal server error occurred.' });
    }
  });

  return router;
}
