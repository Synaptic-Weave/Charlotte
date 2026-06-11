import { EntityManager } from '@mikro-orm/postgresql';
import { Customer } from '../domain/entities/Customer.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';

export class CustomerService {
  constructor(private readonly em: EntityManager) {}

  async findByPhoneNumber(phoneNumber: string): Promise<Customer | null> {
    const tenantCtx = tenantLocalStorage.getStore();
    if (!tenantCtx || !tenantCtx.tenantId) {
      throw new Error('CustomerService must be called within a tenant context');
    }

    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.findOne(Customer, { phoneNumber, tenant: tenantCtx.tenantId });
    });
  }

  async createCustomer(phoneNumber: string, name: string): Promise<Customer> {
    const tenantCtx = tenantLocalStorage.getStore();
    if (!tenantCtx || !tenantCtx.tenantId) {
      throw new Error('CustomerService must be called within a tenant context');
    }

    return await runInTenantTransaction(this.em, async (txEm) => {
      const activeTenant = await txEm.findOne('Tenant', { id: tenantCtx.tenantId });
      if (!activeTenant) throw new Error('Tenant not found');
      
      const newCustomer = Customer.create(activeTenant as any, name, phoneNumber);
      txEm.persist(newCustomer);
      await txEm.flush();
      return newCustomer;
    });
  }
}
