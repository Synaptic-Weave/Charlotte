require('dotenv').config();
const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const webhookUrl = 'https://mannish-keg-yeah.ngrok-free.dev/api/webhook/twilio/inbound-call';

async function updateWebhooks() {
  const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
  for (const number of numbers) {
    console.log(`Updating ${number.phoneNumber} to ngrok...`);
    await client.incomingPhoneNumbers(number.sid).update({
      voiceUrl: webhookUrl,
      voiceMethod: 'POST',
    });
  }
  console.log('Done!');
}
updateWebhooks();
