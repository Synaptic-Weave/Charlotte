import { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../domain/entities/User.js';
import { Tenant } from '../domain/entities/Tenant.js';
import { Organization } from '../domain/entities/Organization.js';
import { TenantAdmin } from '../domain/entities/TenantAdmin.js';
import { runInTenantTransaction, tenantLocalStorage } from '../db/context.js';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { requireEnv } from '../utils/env.js';

export class UserApplicationService {
  constructor(private readonly em: EntityManager) {}

  async findByEmail(email: string): Promise<User | null> {
    const fork = this.em.fork();
    return await fork.findOne(User, { email: email.toLowerCase().trim() } as any, { populate: ['tenant', 'role'] as any });
  }

  async authenticateUser(email: string, passwordPlain: string): Promise<{ token: string, user: User }> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw Object.assign(new Error('Invalid email or password credentials.'), { status: 401 });
    }

    const matches = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!matches) {
      throw Object.assign(new Error('Invalid email or password credentials.'), { status: 401 });
    }

    const JWT_SECRET = requireEnv('JWT_SECRET');
    const token = jwt.sign(
      {
        tenantId: user.tenant.id,
        userId: user.id,
        role: (user.role as any)?.type || 'tenant_admin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return { token, user };
  }

  async registerOnboarding(
    email: string,
    passwordPlain: string,
    tenantName: string,
    destinationNumber: string
  ): Promise<{ token: string, tenant: Tenant }> {
    const fork = this.em.fork();
    const existingUser = await fork.findOne(User, { email: email.toLowerCase().trim() } as any);
    if (existingUser) {
      throw Object.assign(new Error('An account with this email already exists.'), { status: 400 });
    }

    const tenant = Tenant.create(tenantName.trim(), destinationNumber.trim());
    const passwordHash = await bcrypt.hash(passwordPlain, 12);
    
    let userId: string;
    await tenantLocalStorage.run({ tenantId: tenant.id }, async () => {
      await runInTenantTransaction(this.em, async (txEm) => {
        txEm.persist(tenant);

        const tenantAdminRole = new TenantAdmin();
        txEm.persist(tenantAdminRole);
        
        const user = User.create(tenant, email.toLowerCase().trim(), passwordHash, tenantAdminRole);
        txEm.persist(user);
        userId = user.id;

        const org = Organization.create(tenant, tenantName.trim());
        txEm.persist(org);
      });
    });

    const JWT_SECRET = requireEnv('JWT_SECRET');
    const token = jwt.sign(
      {
        tenantId: tenant.id,
        userId: userId!,
        role: 'tenant_admin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return { token, tenant };
  }

  async findById(userId: string): Promise<User | null> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.findOne(User, { id: userId }, { populate: ['role'] as any });
    });
  }

  async listUsers(): Promise<User[]> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.find(User, {}, { populate: ['role'] as any });
    });
  }
}
