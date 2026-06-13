import { Router, Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from '../../domain/entities/UserRole.js';
import { User } from '../../domain/entities/User.js';

export function createAdminRolesRouter(em: EntityManager): Router {
  const router = Router();

  // GET /api/admin/roles
  router.get('/roles', async (req: Request, res: Response): Promise<void> => {
    try {
      const forkedEm = em.fork();
      const roles = await forkedEm.find(UserRole, {});
      res.status(200).json(roles);
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // GET /api/admin/users
  router.get('/users', async (req: Request, res: Response): Promise<void> => {
    try {
      const forkedEm = em.fork();
      const users = await forkedEm.find(User, {}, { populate: ['roles', 'tenant'] });
      // Map to safe DTOs
      const safeUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        tenant: u.tenant ? { id: u.tenant.id, name: u.tenant.name } : null,
        roles: u.roles.getItems().map(r => ({ id: r.id, name: r.name, displayName: r.displayName }))
      }));
      res.status(200).json(safeUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // PUT /api/admin/roles/:id
  router.put('/roles/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { displayName, description } = req.body;
      
      const forkedEm = em.fork();
      const role = await forkedEm.findOne(UserRole, { id });
      
      if (!role) {
        res.status(404).json({ error: 'Role not found.' });
        return;
      }
      
      if (displayName !== undefined) role.displayName = displayName;
      if (description !== undefined) role.description = description;
      
      await forkedEm.flush();
      res.status(200).json(role);
    } catch (error) {
      console.error('Error updating role:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // POST /api/admin/users/:userId/roles
  router.post('/users/:userId/roles', async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { roleId } = req.body;

      if (!roleId) {
        res.status(400).json({ error: 'roleId is required.' });
        return;
      }

      const forkedEm = em.fork();
      
      const user = await forkedEm.findOne(User, { id: userId }, { populate: ['roles'] });
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const role = await forkedEm.findOne(UserRole, { id: roleId });
      if (!role) {
        res.status(404).json({ error: 'Role not found.' });
        return;
      }

      // Check if user already has the role
      const hasRole = user.roles.getItems().some(r => r.id === role.id);
      if (hasRole) {
        res.status(400).json({ error: 'User already has this role.' });
        return;
      }

      user.addRole(role);
      await forkedEm.flush();

      res.status(200).json({ message: 'Role assigned successfully.', user });
    } catch (error) {
      console.error('Error assigning role to user:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
