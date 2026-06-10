const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const m = 'gemini-2.0-flash';
  try {
    const session = await ai.live.connect({ model: m });
    console.log(`Connected to ${m}`);
    // use internal property to see WebSocket URL
    const ws = session.ws || session._ws || session.client?.ws;
    if (ws) console.log(ws.url || ws._url);
    session.close();
  } catch (err) {
    console.log(`Error:`, err);
  }
}
run();
