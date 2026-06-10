const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const m = 'gemini-2.0-flash';
  try {
    const session = await ai.live.connect({ model: m });
    console.log(`Connected to ${m}`);
    session.on('close', (event) => console.log('Closed:', event));
    setTimeout(() => session.close(), 2000);
  } catch (err) {
    console.log(`Error:`, err);
  }
}
run();
