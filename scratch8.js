require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
async function run() {
  const m = process.env.GEMINI_MODEL_NAME;
  try {
    const session = await ai.live.connect({ model: m });
    console.log(`Connected to ${m} on v1alpha`);
    session.close();
  } catch (err) {
    console.log(`Error on v1alpha:`, err);
  }
}
run();
