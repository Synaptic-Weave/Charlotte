import { GoogleGenAI } from '@google/genai';
async function run() {
  const ai = new GoogleGenAI();
  const session = await ai.clients.createLiveClient({ model: 'gemini-3.1-flash-live-preview' });
  console.log(Object.keys(session));
  console.log(typeof session.sendToolResponse);
}
run().catch(console.error);
