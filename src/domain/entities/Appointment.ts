import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';
import { Department } from './Department.js';
import { Customer } from './Customer.js';

export class Appointment {
  readonly id: string;
  tenant: Tenant;
  department: Department;
  customer: Customer;
  date: Date;
  status: string;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    department: Department,
    customer: Customer,
    date: Date,
    status: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.department = department;
    this.customer = customer;
    this.date = date;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, department: Department, customer: Customer, date: Date): Appointment {
    const now = new Date();
    return new Appointment(
      uuidv4(),
      tenant,
      department,
      customer,
      date,
      'SCHEDULED',
      now,
      now
    );
  }

  updateStatus(status: string): void {
    this.status = status;
    this.updatedAt = new Date();
  }

  reschedule(date: Date): void {
    this.date = date;
    this.updatedAt = new Date();
  }
}
