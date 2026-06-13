import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { AppointmentService } from '../src/services/AppointmentService.js';
import { tenantLocalStorage } from '../src/db/context.js';
import { Tenant } from '../src/domain/entities/Tenant.js';
import { Department } from '../src/domain/entities/Department.js';
import { Customer } from '../src/domain/entities/Customer.js';
import { TenantSchema } from '../src/domain/schemas/Tenant.schema.js';
import { UserSchema } from '../src/domain/schemas/User.schema.js';
import { UserRoleSchema, SuperAdminSchema, TenantAdminSchema } from '../src/domain/schemas/UserRole.schema.js';
import { OrganizationSchema } from '../src/domain/schemas/Organization.schema.js';
import { CustomerSchema } from '../src/domain/schemas/Customer.schema.js';
import { DepartmentSchema } from '../src/domain/schemas/Department.schema.js';
import { AppointmentSchema } from '../src/domain/schemas/Appointment.schema.js';
import { v4 as uuidv4 } from 'uuid';

describe('AppointmentService', () => {
  let orm: MikroORM;
  let appointmentSvc: AppointmentService;
  let testTenant: Tenant;
  let otherTenant: Tenant;
  let testDepartment: Department;
  let testCustomer: Customer;
  let otherDepartment: Department;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      entities: [TenantSchema, UserSchema, OrganizationSchema, CustomerSchema, DepartmentSchema, AppointmentSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      entitiesTs: [TenantSchema, UserSchema, OrganizationSchema, CustomerSchema, DepartmentSchema, AppointmentSchema, UserRoleSchema, SuperAdminSchema, TenantAdminSchema],
      allowGlobalContext: true,
    });


    appointmentSvc = new AppointmentService(orm.em);

    testTenant = Tenant.create('Test Clinic', '+15550001111');
    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await import('../src/db/context.js').then(({ runInTenantTransaction }) => runInTenantTransaction(orm.em, async (txEm) => {
        testDepartment = Department.create(testTenant, 'Dental');
        testCustomer = Customer.create(testTenant, 'John Doe', '+15551234567', 'New Patient');
        txEm.persist([testTenant, testDepartment, testCustomer]);
        await txEm.flush();
      }));
    });

    otherTenant = Tenant.create('Other Clinic', '+15550002222');
    await tenantLocalStorage.run({ tenantId: otherTenant.id }, async () => {
      await import('../src/db/context.js').then(({ runInTenantTransaction }) => runInTenantTransaction(orm.em, async (txEm) => {
        otherDepartment = Department.create(otherTenant, 'Dental');
        txEm.persist([otherTenant, otherDepartment]);
        await txEm.flush();
      }));
    });
  });

  afterAll(async () => {
    await orm.close();
  });

  it('should book an appointment for a valid department and future date (Mon-Fri 9-5)', async () => {
    // Find next Monday 10 AM
    const date = new Date();
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7) + 7); // Ensure next week Monday
    date.setHours(10, 0, 0, 0);

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      const appointment = await appointmentSvc.bookAppointment(
        testCustomer.id,
        'Dental',
        date.toISOString()
      );
      expect(appointment).toBeDefined();
      expect(appointment.department.id).toBe(testDepartment.id);
      expect(appointment.customer.id).toBe(testCustomer.id);
      expect(appointment.status).toBe('SCHEDULED');
    });
  });

  it('should enforce tenant isolation (cannot book into another tenants department)', async () => {
    const date = new Date();
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7) + 7);
    date.setHours(10, 0, 0, 0);

    // Attempt to book using testTenant but for a department that belongs to otherTenant.
    // However, they both have a 'Dental' department. It should pick testTenant's department.
    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      const appointment = await appointmentSvc.bookAppointment(
        testCustomer.id,
        'Dental',
        date.toISOString()
      );
      expect(appointment.department.id).toBe(testDepartment.id);
      expect(appointment.department.id).not.toBe(otherDepartment.id);
    });

    // Let's create a department that ONLY exists in otherTenant
    const otherOnlyDept = Department.create(otherTenant, 'Surgery');
    await orm.em.persistAndFlush(otherOnlyDept);

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await expect(
        appointmentSvc.bookAppointment(testCustomer.id, 'Surgery', date.toISOString())
      ).rejects.toThrow('Department not found');
    });
  });

  it('should fail if Date is in the past', async () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await expect(
        appointmentSvc.bookAppointment(testCustomer.id, 'Dental', date.toISOString())
      ).rejects.toThrow('Appointment must be in the future');
    });
  });

  it('should fail if Date is on a weekend', async () => {
    const date = new Date();
    // find next saturday 10 AM
    date.setDate(date.getDate() + ((6 + 7 - date.getDay()) % 7) + 7);
    date.setHours(10, 0, 0, 0);

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await expect(
        appointmentSvc.bookAppointment(testCustomer.id, 'Dental', date.toISOString())
      ).rejects.toThrow('Appointments are only available Monday to Friday');
    });
  });

  it('should fail if Date is outside business hours', async () => {
    const date = new Date();
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7) + 7); // Monday
    date.setHours(18, 0, 0, 0); // 6 PM UTC

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await expect(
        appointmentSvc.bookAppointment(testCustomer.id, 'Dental', date.toISOString())
      ).rejects.toThrow('Appointments are only available between 9 AM and 5 PM');
    });
  });

  it('should throw if called outside tenant context', async () => {
    const date = new Date();
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7) + 7);
    date.setHours(10, 0, 0, 0);

    await expect(
      appointmentSvc.bookAppointment(testCustomer.id, 'Dental', date.toISOString())
    ).rejects.toThrow('AppointmentService must be called within a tenant context');
  });

  it('should fail if Customer does not exist', async () => {
    const date = new Date();
    date.setDate(date.getDate() + ((1 + 7 - date.getDay()) % 7) + 7);
    date.setHours(10, 0, 0, 0);

    await tenantLocalStorage.run({ tenantId: testTenant.id }, async () => {
      await expect(
        appointmentSvc.bookAppointment(uuidv4(), 'Dental', date.toISOString())
      ).rejects.toThrow('Customer not found');
    });
  });
});
