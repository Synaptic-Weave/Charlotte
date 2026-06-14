import { EntityManager } from '@mikro-orm/postgresql';
import { CallSession } from '../domain/entities/CallSession.js';
import { tenantLocalStorage, runInTenantTransaction } from '../db/context.js';
import { Tenant } from '../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';

export class CallSessionService {
  constructor(private readonly em: EntityManager) {}

  async getActiveTenant(tenantId: string): Promise<Tenant | null> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.findOne(Tenant, { id: tenantId });
    });
  }

  async getFallbackDialedNumber(tenantId: string): Promise<string | null> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const activeTenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!activeTenant) return null;
      const phoneRecord = await txEm.findOne(TwilioPhoneNumber, { tenant: activeTenant });
      return phoneRecord?.phoneNumber || null;
    });
  }

  async updateCallStatus(callSid: string, streamSid: string, status: 'active' | 'completed' | 'failed', greetingText?: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const callSession = await txEm.findOne(CallSession, { callSid });
      if (callSession) {
        if (streamSid && status === 'active') {
          callSession.updateStreamSid(streamSid);
        }
        callSession.updateStatus(status);

        if (greetingText && status === 'active') {
          const greetingMsg = {
            id: `msg-greet-${Date.now()}`,
            speaker: 'charlotte' as const,
            text: greetingText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
          callSession.addMessage(greetingMsg);
        }

        txEm.persist(callSession);
        await txEm.flush();
      }
    });
  }

  async addMessageToSession(callSid: string, speaker: 'charlotte' | 'caller', text: string): Promise<void> {
    await runInTenantTransaction(this.em, async (txEm) => {
      const callSession = await txEm.findOne(CallSession, { callSid });
      if (callSession) {
        const lastMsg = callSession.messages && callSession.messages.length > 0
          ? callSession.messages[callSession.messages.length - 1]
          : null;

        if (lastMsg && lastMsg.speaker === speaker) {
          lastMsg.text += ` ${text}`;
          lastMsg.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else {
          const newMsg = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            speaker,
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
          callSession.addMessage(newMsg);
        }

        txEm.persist(callSession);
        await txEm.flush();
      }
    });
  }

  async getCalls(tenantId: string, limit: number, offset: number) {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const [callSessions, count] = await txEm.findAndCount(
        CallSession,
        { tenant: { id: tenantId } },
        {
          orderBy: { createdAt: 'DESC' },
          limit,
          offset,
        }
      );
      return { callSessions, count };
    });
  }

  async getCallStats(tenantId: string) {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const callSessions = await txEm.find(CallSession, { tenant: { id: tenantId } });
      const totalCalls = callSessions.length;
      const completedCalls = callSessions.filter(c => c.status === 'completed');
      
      let totalDurationMs = 0;
      completedCalls.forEach(c => {
        totalDurationMs += c.updatedAt.getTime() - c.createdAt.getTime();
      });
      
      const avgDurationSeconds = completedCalls.length > 0 
        ? Math.round((totalDurationMs / completedCalls.length) / 1000) 
        : 0;

      const initiatedCount = callSessions.filter(c => c.status === 'initiated').length;
      const answeredCount = totalCalls - initiatedCount;
      const answerRate = totalCalls > 0 
        ? Math.round((answeredCount / totalCalls) * 1000) / 10 
        : 100.0;

      return { totalCalls, avgDurationSeconds, answerRate };
    });
  }

  async createCall(tenantId: string, callSid?: string, callerNumber?: string): Promise<CallSession> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) throw new Error('Tenant organization not found.');

      const actualCallSid = callSid || `mock-sid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const callSession = CallSession.create(tenant, actualCallSid, callerNumber || 'Unknown');
      txEm.persist(callSession);
      await txEm.flush();
      return callSession;
    });
  }

  async createCallWithContext(tenantId: string, callSid: string, callerNumber?: string): Promise<CallSession> {
    return await tenantLocalStorage.run({ tenantId }, async () => {
      return await runInTenantTransaction(this.em, async (txEm) => {
        const tenant = await txEm.findOne(Tenant, { id: tenantId });
        if (!tenant) throw new Error('Tenant organization not found.');

        const existing = await txEm.findOne(CallSession, { callSid });
        if (existing) return existing;

        const callSession = CallSession.create(tenant, callSid, callerNumber || 'Unknown');
        txEm.persist(callSession);
        await txEm.flush();
        return callSession;
      });
    });
  }

  async addMessageToSessionById(id: string, speaker: 'charlotte' | 'caller', text: string, timestamp?: string): Promise<CallSession> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const callSession = await txEm.findOne(CallSession, { id });
      if (!callSession) throw new Error('Call session not found.');

      const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        speaker,
        text,
        timestamp: timeStr,
      };

      callSession.addMessage(newMsg);
      txEm.persist(callSession);
      await txEm.flush();
      return callSession;
    });
  }

  async updateCallSessionById(id: string, status?: string, streamSid?: string): Promise<CallSession> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const callSession = await txEm.findOne(CallSession, { id });
      if (!callSession) throw new Error('Call session not found.');

      if (status) callSession.updateStatus(status as 'active' | 'completed' | 'failed' | 'initiated');
      if (streamSid) callSession.updateStreamSid(streamSid);

      txEm.persist(callSession);
      await txEm.flush();
      return callSession;
    });
  }

  async findTenantIdByPhoneNumber(phoneNumber: string): Promise<string | null> {
    const fork = this.em.fork();
    const phoneRecord = await fork.findOne(TwilioPhoneNumber, { phoneNumber }, { populate: ['tenant'] });
    if (!phoneRecord) return null;
    return phoneRecord.tenant.id;
  }

  async updateRecordingUrl(callSid: string, recordingUrl: string): Promise<void> {
    const fork = this.em.fork();
    const callSession = await fork.findOne(CallSession, { callSid }, { populate: ['tenant'] });
    if (!callSession) return;
    
    await tenantLocalStorage.run({ tenantId: callSession.tenant.id }, async () => {
      await runInTenantTransaction(this.em, async (txEm) => {
        const session = await txEm.findOne(CallSession, { callSid });
        if (session) {
          session.updateRecordingUrl(recordingUrl);
          txEm.persist(session);
          await txEm.flush();
        }
      });
    });
  }
}
