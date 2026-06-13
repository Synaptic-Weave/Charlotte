import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI();
async function test() {
  const session = await ai.live.connect({ model: 'gemini-3.1-flash' });
  session.sendRealtimeInput([{ clientContent: {} }]);
}
