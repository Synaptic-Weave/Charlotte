import { EntitySchema } from '@mikro-orm/core';
import { TwilioPhoneNumber } from '../entities/TwilioPhoneNumber.js';

export const TwilioPhoneNumberSchema = new EntitySchema<TwilioPhoneNumber>({
  class: TwilioPhoneNumber,
  name: 'TwilioPhoneNumber',
  tableName: 'twilio_phone_numbers',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    phoneNumber: { type: 'string', unique: true },
    friendlyName: { type: 'string' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
