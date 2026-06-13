import { EntitySchema } from '@mikro-orm/core';
import { UserRole } from '../entities/UserRole.js';
import { SuperAdmin } from '../entities/SuperAdmin.js';
import { TenantAdmin } from '../entities/TenantAdmin.js';

export const UserRoleSchema = new EntitySchema<UserRole>({
  class: UserRole,
  name: 'UserRole',
  tableName: 'user_roles',
  abstract: false,
  discriminatorColumn: 'type',
  discriminatorMap: {
    super_admin: 'SuperAdmin',
    tenant_admin: 'TenantAdmin',
  },
  properties: {
    id: { type: 'uuid', primary: true },
    type: { type: 'string' },
    createdAt: { type: 'Date' },
  },
});

export const SuperAdminSchema = new EntitySchema<SuperAdmin>({
  class: SuperAdmin,
  name: 'SuperAdmin',
  extends: 'UserRole',
  properties: {} as any,
});

export const TenantAdminSchema = new EntitySchema<TenantAdmin>({
  class: TenantAdmin,
  name: 'TenantAdmin',
  extends: 'UserRole',
  properties: {} as any,
});
