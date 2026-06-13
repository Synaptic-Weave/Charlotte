import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkNumbers() {
  const numbers = await client.incomingPhoneNumbers.list();
  for (const num of numbers) {
    console.log(`Phone: ${num.phoneNumber}, VoiceURL: ${num.voiceUrl}`);
    if (num.voiceUrl && num.voiceUrl.includes('charlotte-backend-prod')) {
      const newUrl = num.voiceUrl.replace('charlotte-backend-prod', 'charlotte-backend');
      console.log(`Updating ${num.phoneNumber} to ${newUrl}`);
      await client.incomingPhoneNumbers(num.sid).update({ voiceUrl: newUrl });
      console.log(`Updated successfully.`);
    }
  }
}

checkNumbers().catch(console.error);
