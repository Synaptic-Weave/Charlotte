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
}
