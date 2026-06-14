import twilio from 'twilio';
import { EntityManager } from '@mikro-orm/postgresql';
import { Tenant } from '../domain/entities/Tenant.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';
import { runInTenantTransaction } from '../db/context.js';

export class NumberService {
  private twilioClient: twilio.Twilio | null;

  constructor(private readonly em: EntityManager) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC') && !accountSid.startsWith('ACXX') && !accountSid.startsWith('AC000');
    this.twilioClient = isTwilioConfigured ? twilio(accountSid, authToken) : null;
  }

  async searchAvailableNumbers(areaCode: string) {
    if (!this.twilioClient) {
      throw new Error('Real Twilio credentials (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN) are missing. Cannot assign a real number. Please update your environment variables.');
    }

    const availableNumbers = await this.twilioClient.availablePhoneNumbers('US').local.list({
      areaCode: Number(areaCode),
      limit: 10,
    });

    return availableNumbers.map((num) => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName || num.phoneNumber,
      locality: num.locality || 'Unknown',
      region: num.region || 'US',
    }));
  }

  async provisionNumberWithTwilio(phoneNumber: string, friendlyName: string, voiceUrl: string) {
    if (!this.twilioClient) {
      throw new Error('Real Twilio credentials (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN) are missing. Cannot assign a real number. Please update your environment variables.');
    }

    await this.twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName,
      voiceUrl,
    });
  }



  async getProvisionedNumbers(tenantId: string): Promise<TwilioPhoneNumber[]> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      return await txEm.find(TwilioPhoneNumber, { tenant: { id: tenantId } });
    });
  }

  async provisionNumber(tenantId: string, phoneNumber: string, friendlyName: string): Promise<TwilioPhoneNumber> {
    return await runInTenantTransaction(this.em, async (txEm) => {
      const tenant = await txEm.findOne(Tenant, { id: tenantId });
      if (!tenant) {
        throw new Error('Tenant organization not found.');
      }

      const twilioPhone = TwilioPhoneNumber.create(tenant, phoneNumber, friendlyName);
      txEm.persist(twilioPhone);
      await txEm.flush();

      return twilioPhone;
    });
  }
}
