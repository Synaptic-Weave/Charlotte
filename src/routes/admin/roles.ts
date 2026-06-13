import { Router } from 'express';
import { z } from 'zod';
import { AdminService } from '../../services/AdminService.js';

const assignRoleSchema = z.object({
  email: z.string().email(),
  roleType: z.enum(['super_admin', 'tenant_admin']),
});

export function createAdminRolesRouter(adminService: AdminService): Router {
  const router = Router();

  /**
   * POST /api/admin/roles
   * Assign a role to a user.
   */
  router.post('/', async (req, res) => {
    try {
      const parseResult = assignRoleSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Valid email and roleType (super_admin or tenant_admin) are required.' });
        return;
      }

      await adminService.assignRole(parseResult.data);

      res.status(200).json({ message: 'Role assigned successfully.' });
    } catch (error: any) {
      console.error('Error assigning role:', error);
      const status = error.status || (error.message.includes('not found') ? 404 : 500);
      res.status(status).json({ error: error.message || 'Internal server error occurred.' });
    }
  });

  /**
   * GET /api/admin/roles
   * List users and their roles.
   */
  router.get('/', async (req, res) => {
    try {
      const users = await adminService.listRoles();
      res.status(200).json({ users });
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Internal server error occurred.' });
    }
  });

  return router;
}
