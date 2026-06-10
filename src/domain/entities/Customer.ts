import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export class Customer {
  readonly id: string;
  tenant: Tenant;
  name: string;
  phoneNumber: string;
  context: string;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    name: string,
    phoneNumber: string,
    context: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.name = name;
    this.phoneNumber = phoneNumber;
    this.context = context;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, name: string, phoneNumber: string, context: string = ''): Customer {
    const now = new Date();
    return new Customer(
      uuidv4(),
      tenant,
      name,
      phoneNumber,
      context,
      now,
      now
    );
  }

  updateContext(context: string): void {
    this.context = context;
    this.updatedAt = new Date();
  }

  updateName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
  }
}
