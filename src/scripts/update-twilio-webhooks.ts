import { MikroORM } from '@mikro-orm/postgresql';
import twilio from 'twilio';
import config from '../mikro-orm.config.js';
import { TwilioPhoneNumber } from '../domain/entities/TwilioPhoneNumber.js';

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.');
    process.exit(1);
  }

  const twilioClient = twilio(accountSid, authToken);

  const newBaseUrl = 'https://charlotte-backend-prod-unsa2gq4ta-uc.a.run.app';
  const newVoiceUrl = `${newBaseUrl}/api/webhook/twilio/inbound-call`;

  const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list();

  console.log(`Found ${incomingPhoneNumbers.length} phone numbers in Twilio account. Updating Voice URLs to: ${newVoiceUrl}`);

  for (const twilioNum of incomingPhoneNumbers) {
    console.log(`Updating ${twilioNum.phoneNumber} (SID: ${twilioNum.sid})...`);
    await twilioClient.incomingPhoneNumbers(twilioNum.sid).update({
      voiceUrl: newVoiceUrl,
    });
    console.log(`Updated ${twilioNum.phoneNumber} successfully.`);
  }

  console.log('Done.');
}

main().catch(console.error);
