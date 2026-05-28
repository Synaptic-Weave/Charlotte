import { EntitySchema } from '@mikro-orm/core';
import { Organization } from '../entities/Organization.js';

export const OrganizationSchema = new EntitySchema<Organization>({
  class: Organization,
  name: 'Organization',
  tableName: 'organizations',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    name: { type: 'string' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
