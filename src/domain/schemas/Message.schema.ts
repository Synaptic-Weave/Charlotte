import { EntitySchema } from '@mikro-orm/core';
import { Message } from '../entities/Message.js';

export const MessageSchema = new EntitySchema<Message>({
  class: Message,
  name: 'Message',
  tableName: 'messages',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => 'Tenant', deleteRule: 'cascade' },
    callSession: { kind: 'm:1', entity: () => 'CallSession', deleteRule: 'cascade' },
    summary: { type: 'text' },
    recordingUrl: { type: 'string', nullable: true },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date', onUpdate: () => new Date() },
  },
});
