import { EntitySchema } from '@mikro-orm/core';
import { Tenant } from '../entities/Tenant.js';

export const TenantSchema = new EntitySchema<Tenant>({
  class: Tenant,
  name: 'Tenant',
  tableName: 'tenants',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string' },
    destinationNumber: { type: 'string' },
    destinationVerified: { type: 'boolean' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
    googleRefreshToken: { type: 'string', nullable: true },
    googleCalendarId: { type: 'string', nullable: true },
  },
});
