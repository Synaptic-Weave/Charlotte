import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { runInTenantTransaction } from '../db/context.js';

export class IntegrationService {
  constructor(private readonly em: EntityManager) {}

  async updateGoogleRefreshToken(tenantId: string, refreshToken: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      
      tenant.googleRefreshToken = refreshToken;
      txEm.persist(tenant);
      await txEm.flush();
    });
  }

  async getTenant(tenantId: string): Promise<Tenant> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      return tenant;
    });
  }

  async updateGoogleCalendarId(tenantId: string, calendarId: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant not found');
      
      tenant.googleCalendarId = calendarId;
      txEm.persist(tenant);
      await txEm.flush();
    });
  }
}
