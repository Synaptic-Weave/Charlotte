import { EntitySchema } from '@mikro-orm/core';
import { SuperAdmin } from '../entities/SuperAdmin.js';

export const SuperAdminSchema = new EntitySchema<SuperAdmin>({
  class: SuperAdmin,
  name: 'SuperAdmin',
  extends: 'UserRole',
  discriminatorValue: 'super_admin',
});
