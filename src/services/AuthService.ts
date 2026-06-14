import { EntityManager } from '@mikro-orm/postgresql';

import jwt from 'jsonwebtoken';
import { Tenant } from '../domain/entities/Tenant.js';
import { User } from '../domain/entities/User.js';
import { Organization } from '../domain/entities/Organization.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-123';

export class AuthService {
  constructor(private readonly em: EntityManager) {}

  async registerUser(tenantName: string, destinationNumber: string, email: string, passwordHash: string) {
    const tenant = Tenant.create(tenantName, destinationNumber);
    const context = { tenantId: tenant.id };

    let userId: string = '';
    await tenantLocalStorage.run(context, async () => {
      await runInTenantTransaction(this.em, async (txEm) => {
        txEm.persist(tenant);

        const user = User.create(tenant, email, passwordHash, 'admin');
        txEm.persist(user);
        userId = user.id;

        const org = Organization.create(tenant, tenantName);
        txEm.persist(org);
      });
    });

    const token = jwt.sign(
      {
        tenantId: tenant.id,
        userId: userId,
        role: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return { tenant, token };
  }

  async verifyDestination(tenantId: string): Promise<Tenant> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) {
        throw new Error('Tenant not found.');
      }

      tenant.updateDestination(tenant.destinationNumber, true);
      await txEm.flush();
      return tenant;
    });
  }

  async getSettings(tenantId: string, userId: string) {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found.');
      
      const user = await txEm.findOne(User, { id: userId });
      return { tenant, user };
    });
  }

  async updateSettings(tenantId: string, name: string, destinationNumber: string): Promise<Tenant> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      
      if (!tenant) {
        throw new Error('Tenant not found.');
      }

      const numberChanged = tenant.destinationNumber !== destinationNumber;
      tenant.updateName(name);
      tenant.updateDestination(destinationNumber, !numberChanged ? tenant.destinationVerified : false);
      
      await txEm.flush();
      return tenant;
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const fork = this.em.fork();
    return await fork.findOne(User, { email }, { populate: ['tenant'] });
  }
}
