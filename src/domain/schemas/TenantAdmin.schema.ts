import { EntitySchema } from '@mikro-orm/core';
import { TenantAdmin } from '../entities/TenantAdmin.js';

export const TenantAdminSchema = new EntitySchema<TenantAdmin>({
  class: TenantAdmin,
  name: 'TenantAdmin',
  extends: 'UserRole',
  discriminatorValue: 'tenant_admin',
});
