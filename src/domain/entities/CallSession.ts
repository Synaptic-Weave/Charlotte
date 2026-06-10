import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './Tenant.js';

export type CallSessionStatus = 'initiated' | 'active' | 'completed' | 'failed';

export class CallSession {
  readonly id: string;
  tenant: Tenant;
  callSid: string;
  streamSid: string | null;
  status: CallSessionStatus;
  callerNumber: string;
  messages: any[];
  recordingUrl: string | null;
  readonly createdAt: Date;
  updatedAt: Date;

  private constructor(
    id: string,
    tenant: Tenant,
    callSid: string,
    streamSid: string | null,
    status: CallSessionStatus,
    callerNumber: string,
    messages: any[],
    recordingUrl: string | null,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.tenant = tenant;
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.status = status;
    this.callerNumber = callerNumber;
    this.messages = messages;
    this.recordingUrl = recordingUrl;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(tenant: Tenant, callSid: string, callerNumber: string = 'Unknown'): CallSession {
    const now = new Date();
    return new CallSession(
      uuidv4(),
      tenant,
      callSid,
      null,
      'initiated',
      callerNumber,
      [],
      null,
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

  addMessage(msg: { id: string; speaker: 'charlotte' | 'caller'; text: string; timestamp?: string }): void {
    if (!this.messages) {
      this.messages = [];
    }
    this.messages.push(msg);
    this.updatedAt = new Date();
  }

  updateRecordingUrl(recordingUrl: string): void {
    this.recordingUrl = recordingUrl;
    this.updatedAt = new Date();
  }
}
