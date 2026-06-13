import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../domain/entities/User.js';
import { UserRole } from '../domain/entities/UserRole.js';
import { runInGlobalTransaction } from '../db/context.js';

export class AdminService {
  constructor(private readonly em: EntityManager) {}

  async listAllUsersGlobally(): Promise<Record<string, unknown>[]> {
    return await runInGlobalTransaction(this.em, async (txEm) => {
      const users = await txEm.find(User, {}, { populate: ['tenant', 'role'] as never });
      return users.map((u) => ({
        id: u.id,
        email: u.email,
        tenantId: u.tenant.id,
        role: u.role ? (u.role as never).type : null,
      }));
    });
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    await runInGlobalTransaction(this.em, async (txEm) => {
      const user = await txEm.findOne(User, { id: userId });
      if (!user) {
        throw Object.assign(new Error('User not found'), { status: 404 });
      }
      const role = await txEm.findOne(UserRole, { id: roleId });
      if (!role) {
        throw Object.assign(new Error('Role not found'), { status: 404 });
      }
      
      user.updateRole(role);
      await txEm.flush();
    });
  }
}
