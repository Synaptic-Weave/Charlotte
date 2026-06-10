import { EntitySchema } from '@mikro-orm/core';
import { Customer } from '../entities/Customer.js';

export const CustomerSchema = new EntitySchema<Customer>({
  class: Customer,
  name: 'Customer',
  tableName: 'customers',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    name: { type: 'string' },
    phoneNumber: { type: 'string' },
    context: { type: 'text', nullable: true },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
