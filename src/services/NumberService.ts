import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { runInTenantTransaction } from '../db/context.js';

export class NumberService {
  constructor(private readonly em: EntityManager) {}

  async getProvisionedNumbers(tenantId: string): Promise<TwilioPhoneNumber[]> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.find(TwilioPhoneNumber, { tenant: { id: tenantId } });
    });
  }

  async provisionNumber(tenantId: string, phoneNumber: string, friendlyName: string): Promise<TwilioPhoneNumber> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) {
        throw new Error('Tenant organization not found.');
      }

      const twilioPhone = TwilioPhoneNumber.create(tenant, phoneNumber, friendlyName);
      txEm.persist(twilioPhone);
      await txEm.flush();

      return twilioPhone;
    });
  }
}
