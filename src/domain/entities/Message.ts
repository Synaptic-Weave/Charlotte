import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';
import { CallSession } from './CallSession.js';

export class Message {
  readonly id: string;
  tenant: Tenant;
  callSession: CallSession;
  summary: string;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    callSession: CallSession,
    summary: string,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.callSession = callSession;
    this.summary = summary;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, callSession: CallSession, summary: string): Message {
    const now = new Date();
    return new Message(uuidv4(), tenant, callSession, summary, now, now);
  }
}
