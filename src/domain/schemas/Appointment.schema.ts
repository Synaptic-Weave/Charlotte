import { EntitySchema } from '@mikro-orm/core';
import { Appointment } from '../entities/Appointment.js';

export const AppointmentSchema = new EntitySchema<Appointment>({
  class: Appointment,
  name: 'Appointment',
  tableName: 'appointments',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    department: { kind: 'm:1', entity: () => 'Department', deleteRule: 'cascade' },
    customer: { kind: 'm:1', entity: () => 'Customer', deleteRule: 'cascade' },
    date: { type: 'Date' },
    status: { type: 'string' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
