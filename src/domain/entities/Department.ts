import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export class Department {
  readonly id: string;
  tenant: Tenant;
  name: string;
  routingNumber: string | null;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    name: string,
    routingNumber: string | null,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.name = name;
    this.routingNumber = routingNumber;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, name: string, routingNumber: string | null = null): Department {
    const now = new Date();
    return new Department(
      uuidv4(),
      tenant,
      name,
      routingNumber,
      now,
      now
    );
  }

  updateRoutingNumber(routingNumber: string | null): void {
    this.routingNumber = routingNumber;
    this.updatedAt = new Date();
  }
}
