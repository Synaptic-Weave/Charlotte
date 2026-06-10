require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken || accountSid.startsWith('ACXX')) {
  console.error('Twilio credentials not properly configured in .env');
  process.exit(1);
}

const client = twilio(accountSid, authToken);
const webhookUrl = 'https://charlotte-backend-unsa2gq4ta-uc.a.run.app/api/webhook/twilio/inbound-call';

async function updateWebhooks() {
  try {
    console.log('Fetching incoming phone numbers from Twilio...');
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    
    if (numbers.length === 0) {
      console.log('No phone numbers found on this Twilio account.');
      return;
    }

    for (const number of numbers) {
      console.log(`Updating ${number.phoneNumber} (${number.friendlyName})...`);
      await client.incomingPhoneNumbers(number.sid).update({
        voiceUrl: webhookUrl,
        voiceMethod: 'POST',
      });
      console.log(`Successfully updated webhook for ${number.phoneNumber}`);
    }

    console.log('\nAll webhooks have been updated to point to the production backend!');
  } catch (error) {
    console.error('Error updating webhooks:', error);
  }
}

updateWebhooks();
