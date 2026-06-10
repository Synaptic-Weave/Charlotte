import { EntitySchema } from '@mikro-orm/core';
import { Department } from '../entities/Department.js';

export const DepartmentSchema = new EntitySchema<Department>({
  class: Department,
  name: 'Department',
  tableName: 'departments',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    name: { type: 'string' },
    routingNumber: { type: 'string', nullable: true },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
