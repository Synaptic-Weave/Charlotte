import { EntityManager } from '@mikro-orm/postgresql';
import { Appointment } from '../domain/entities/Appointment.js';
import { Department } from '../domain/entities/Department.js';
import { Customer } from '../domain/entities/Customer.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';

export class AppointmentService {
  constructor(private readonly em: EntityManager) {}

  async bookAppointment(
    customerId: string,
    departmentName: string,
    dateString: string
  ): Promise<Appointment> {
    const tenantCtx = tenantLocalStorage.getStore();
    if (!tenantCtx || !tenantCtx.tenantId) {
      throw new Error('AppointmentService must be called within a tenant context');
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid Date/Time format');
    }

    // Schedule constraints: Must be in future, Mon-Fri, 9AM-5PM
    const now = new Date();
    if (date <= now) {
      throw new Error('Appointment must be in the future');
    }
    const day = date.getDay();
    if (day === 0 || day === 6) {
      throw new Error('Appointments are only available Monday to Friday');
    }
    const hours = date.getHours();
    if (hours < 9 || hours >= 17) {
      throw new Error('Appointments are only available between 9 AM and 5 PM');
    }

    return await runInTenantTransaction(this.em, async (txEm) => {
      // Constraints: Department must exist
      const department = await txEm.findOne(Department, { name: departmentName, tenant: tenantCtx.tenantId });
      if (!department) {
        throw new Error('Department not found');
      }

      // Customer must exist
      const customer = await txEm.findOne(Customer, { id: customerId, tenant: tenantCtx.tenantId });
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Check if slot is already booked for this department (e.g. within 30 mins) - maybe overengineering?
      // Let's just create it
      const appointment = Appointment.create(department.tenant, department, customer, date);
      await txEm.persistAndFlush(appointment);
      
      return appointment;
    });
  }
}
