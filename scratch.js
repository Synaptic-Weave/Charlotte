const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const models = await ai.models.list();
    for (const model of models) {
        console.log(model.name);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
