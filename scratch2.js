const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const models = [
    'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.5-flash', 'gemini-3.5-flash'
  ];
  for (const m of models) {
    try {
      const session = await ai.live.connect({ model: m });
      console.log(`Successfully connected to ${m}`);
      session.close();
      break;
    } catch (err) {
      console.log(`Failed for ${m}:`, err.message || err);
    }
  }
}
run();
