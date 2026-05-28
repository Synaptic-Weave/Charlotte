import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export type CallSessionStatus = 'initiated' | 'active' | 'completed' | 'failed';

export class CallSession {
  readonly id: string;
  tenant: Tenant;
  callSid: string;
  streamSid: string | null;
  status: CallSessionStatus;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    callSid: string,
    streamSid: string | null,
    status: CallSessionStatus,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, callSid: string): CallSession {
    const now = new Date();
    return new CallSession(
      uuidv4(),
      tenant,
      callSid,
      null,
      'initiated',
      now,
      now
    );
  }

  updateStreamSid(streamSid: string): void {
    this.streamSid = streamSid;
    this.updatedAt = new Date();
  }

  updateStatus(status: CallSessionStatus): void {
    this.status = status;
    this.updatedAt = new Date();
  }
}
