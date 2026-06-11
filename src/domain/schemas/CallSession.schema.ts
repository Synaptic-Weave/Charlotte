import { EntitySchema } from '@mikro-orm/core';
import { CallSession } from '../entities/CallSession.js';

export const CallSessionSchema = new EntitySchema<CallSession>({
  class: CallSession,
  name: 'CallSession',
  tableName: 'call_sessions',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    callSid: { type: 'string', unique: true },
    streamSid: { type: 'string', nullable: true },
    status: { type: 'string' },
    callerNumber: { type: 'string', default: 'Unknown' },
    callerName: { type: 'string', nullable: true },
    callerPurpose: { type: 'string', nullable: true },
    messages: { type: 'json', nullable: true },
    recordingUrl: { type: 'string', nullable: true },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
