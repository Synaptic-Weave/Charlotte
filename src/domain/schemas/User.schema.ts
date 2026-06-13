import { EntitySchema } from '@mikro-orm/core';
import { User } from '../entities/User.js';

export const UserSchema = new EntitySchema<User>({
  class: User,
  name: 'User',
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    email: { type: 'string', unique: true },
    passwordHash: { type: 'string' },
    role: { type: 'string' },
    roles: { kind: 'm:n', entity: () => 'UserRole', pivotTable: 'user_roles_mapping' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
