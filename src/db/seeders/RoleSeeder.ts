import { EntityManager } from '@mikro-orm/core';
import { SuperAdmin } from '../../domain/entities/SuperAdmin.js';
import { User } from '../../domain/entities/User.js';

export class RoleSeeder {
  async run(em: EntityManager): Promise<void> {
    const superAdminRole = new SuperAdmin();
    em.persist(superAdminRole);

    const users = await em.find<User>(User, {
      email: { $in: ['mbrown77@gmail.com', 'mbrown@synapticweave.com'] },
    } as never);

    for (const user of users) {
      user.updateRole(superAdminRole);
    }
  }
}
