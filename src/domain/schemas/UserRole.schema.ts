import { EntitySchema } from '@mikro-orm/core';
import { UserRole } from '../entities/UserRole.js';

export const UserRoleSchema = new EntitySchema<UserRole>({
  class: UserRole as any,
  name: 'UserRole',
  tableName: 'user_roles',
  discriminatorColumn: 'type',
  discriminatorMap: {
    super_admin: 'SuperAdmin',
    tenant_admin: 'TenantAdmin',
  },
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', unique: true },
    displayName: { type: 'string' },
    description: { type: 'string' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
