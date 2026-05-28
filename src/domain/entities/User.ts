import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export class User {
  readonly id: string;
  tenant: Tenant;
  email: string;
  passwordHash: string;
  role: string;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    email: string,
    passwordHash: string,
    role: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.email = email;
    this.passwordHash = passwordHash;
    this.role = role;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, email: string, passwordHash: string, role: string): User {
    const now = new Date();
    return new User(
      uuidv4(),
      tenant,
      email,
      passwordHash,
      role,
      now,
      now
    );
  }

  updatePassword(hash: string): void {
    this.passwordHash = hash;
    this.updatedAt = new Date();
  }

  updateRole(role: string): void {
    this.role = role;
    this.updatedAt = new Date();
  }
}
